 if (window.lucide) window.lucide.createIcons();

    // ==========================================
    // KONFIGURASI API GOOGLE APPS SCRIPT
    // ==========================================
    const GAS_URL = "https://script.google.com/macros/s/AKfycbzwqdAugrYUPjAO5MGucqO6D9oqWTKtaZQTWHiDoiD57YzXQN-K3KQbGquncOSnISvH/exec";
    
    let allBooks = [];
    let allVisits = [];
    let allAnnouncements = [];
    
    let currentCategory = '';
    let isAdminMode = false;
    let isAnnounceAdmin = false;
    let currentAdminPin = ""; // Disimpan di memori (RAM) saat diketik, bukan di hardcode
    
    let pendingBook = null;
    let adminContext = ''; 

    // DOM Elements
    const categoryView = document.getElementById('category-view');
    const detailView = document.getElementById('detail-view');
    const detailTitle = document.getElementById('detail-title');
    const bookList = document.getElementById('book-list');
    const emptyBooks = document.getElementById('empty-books');
    const form = document.getElementById('add-book-form');
    const adminFormContainer = document.getElementById('admin-form-container');
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    const adminModal = document.getElementById('admin-modal');
    const adminPinInput = document.getElementById('admin-pin');
    const adminCancelBtn = document.getElementById('admin-cancel-btn');
    const adminSubmitBtn = document.getElementById('admin-submit-btn');
    const adminError = document.getElementById('admin-error');
    const visitorModal = document.getElementById('visitor-modal');
    const visitorForm = document.getElementById('visitor-form');
    const visitorCancelBtn = document.getElementById('visitor-cancel-btn');
    const announceAdminBtn = document.getElementById('announce-admin-btn');
    const announceFormContainer = document.getElementById('announce-form-container');
    const announceForm = document.getElementById('announce-form');
    const announcementList = document.getElementById('announcement-list');
    const emptyAnnouncements = document.getElementById('empty-announcements');
    const bookSearchInput = document.getElementById('book-search-input');

    // ==========================================
    // FUNGSI FETCH DATA DARI GOOGLE SHEETS
    // ==========================================
    async function loadDataFromDatabase() {
        try {
            const response = await fetch(GAS_URL);
            const result = await response.json();
            
            if (result.status === "success") {
                allBooks = result.data.books || [];
                allVisits = result.data.visits || [];
                allAnnouncements = result.data.announcements || [];
                
                // Urutkan pengumuman (terbaru di atas)
                allAnnouncements.sort((a, b) => new Date(b.announcement_date) - new Date(a.announcement_date));

                updateStats();
                renderAnnouncements();
                if (!detailView.classList.contains('hidden')) renderBooks();
            }
        } catch (error) {
            console.error("Gagal mengambil data:", error);
        }
    }

    // ==========================================
    // LOGIKA TAMPILAN (UI)
    // ==========================================
    function updateStats() {
      renderLeaderboard(allVisits);
      document.getElementById('stat-total-count').textContent = allVisits.length;
      const counts = {};
      allVisits.forEach(v => { const t = v.visitor_book_title || ''; counts[t] = (counts[t] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
      ['stat-top1', 'stat-top2', 'stat-top3'].forEach((id, i) => {
        const titleEl = document.getElementById(id + '-title');
        const countEl = document.getElementById(id + '-count');
        if (sorted[i]) { titleEl.textContent = sorted[i][0]; countEl.textContent = sorted[i][1] + ' kunjungan'; }
        else { titleEl.textContent = '-'; countEl.textContent = '0 kunjungan'; }
      });
    }

    function renderLeaderboard(visits) {
      const leaderboard = document.getElementById('visitor-leaderboard');
      const empty = document.getElementById('empty-leaderboard');
      const counts = {};
      visits.forEach(v => {
        const name = (v.visitor_name || 'Pengunjung').trim();
        counts[name] = (counts[name] || 0) + 1;
      });
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
      leaderboard.innerHTML = '';
      empty.classList.toggle('hidden', ranked.length > 0);
      ranked.forEach(([name, count], index) => {
        const card = document.createElement('article');
        card.className = `leaderboard-card rounded-xl p-4 shadow-sm flex items-center gap-3 ${index < 3 ? 'top-rank' : ''}`;
        card.innerHTML = `<span class="rank-badge">${index + 1}</span><div class="min-w-0"><p class="font-bold text-stone-800 truncate"></p><p class="text-xs text-stone-500">${count} kunjungan</p></div>`;
        card.querySelector('p').textContent = name;
        leaderboard.appendChild(card);
      });
    }

    function renderAnnouncements() {
      if (allAnnouncements.length === 0) {
        announcementList.innerHTML = '';
        emptyAnnouncements.classList.remove('hidden');
        return;
      }
      emptyAnnouncements.classList.add('hidden');
      announcementList.innerHTML = '';
      
      const template = document.getElementById('announcement-card-template');
      allAnnouncements.forEach(item => {
        const clone = template.content.cloneNode(true);
        const wrapper = clone.firstElementChild;
        
        const dateStr = item.announcement_date ? new Date(item.announcement_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        wrapper.querySelector('[data-template-id="announcement-card-date"]').textContent = dateStr;
        wrapper.querySelector('[data-template-id="announcement-card-title"]').textContent = item.announcement_title || '';
        wrapper.querySelector('[data-template-id="announcement-card-content"]').textContent = item.announcement_content || '';
        
        const delBtn = wrapper.querySelector('.announcement-delete-btn');
        delBtn.textContent = "Hapus";
        delBtn.className = "canva-button announcement-delete-btn shrink-0 px-3 py-1 bg-red-600 text-white rounded-lg text-sm";
        if (isAnnounceAdmin) delBtn.classList.remove('hidden');
        else delBtn.classList.add('hidden');

        delBtn.addEventListener('click', async () => {
          delBtn.disabled = true;
          delBtn.textContent = "Menghapus...";
          await sendDataToGAS('deleteAnnouncement', { id: item.id });
          loadDataFromDatabase();
        });
        
        announcementList.appendChild(clone);
      });
    }

    function renderBooks() {
      const query = bookSearchInput.value.trim().toLowerCase();
      const filtered = allBooks.filter(b => b.category === currentCategory && (!query || [b.title, b.author, b.publisher, b.year].some(value => (value || '').toString().toLowerCase().includes(query))));
      
      if (filtered.length === 0) { 
          bookList.innerHTML = ''; 
          emptyBooks.classList.remove('hidden'); 
          return; 
      }
      emptyBooks.classList.add('hidden');
      bookList.innerHTML = '';
      
      const template = document.getElementById('book-card-template');
      filtered.forEach(book => {
        const clone = template.content.cloneNode(true);
        const wrapper = clone.firstElementChild;
        
        wrapper.querySelector('[data-template-id="book-card-title"]').textContent = book.title;
        wrapper.querySelector('[data-template-id="book-card-meta"]').textContent = `${book.author} • ${book.year || '-'}`;
        
        const liveCoverImg = wrapper.querySelector('[data-template-id="book-card-cover"]');
        if (book.cover_url) {
          liveCoverImg.src = book.cover_url;
          liveCoverImg.alt = book.title;
        }

        // Tombol Baca
        const readBtn = wrapper.querySelector('.read-btn');
        readBtn.textContent = "Baca Buku";
        readBtn.className = "canva-button flex items-center gap-1 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium text-sm";
        readBtn.addEventListener('click', () => {
          pendingBook = book;
          visitorModal.classList.remove('hidden');
          document.getElementById('visitor-name-input').focus();
        });

        // Tombol Hapus (Hanya Admin)
        const deleteBtn = wrapper.querySelector('.delete-btn');
        deleteBtn.textContent = "Hapus";
        deleteBtn.className = "canva-button delete-btn flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg font-medium text-sm";
        
        if (isAdminMode) deleteBtn.classList.remove('hidden');
        else deleteBtn.classList.add('hidden');

        deleteBtn.addEventListener('click', async e => {
          if(!confirm("Yakin ingin menghapus buku ini?")) return;
          e.currentTarget.disabled = true;
          e.currentTarget.textContent = "Loading...";
          await sendDataToGAS('deleteBook', { id: book.id });
          loadDataFromDatabase();
        });

        bookList.appendChild(clone);
      });
      if (window.lucide) window.lucide.createIcons();
    }

    // ==========================================
    // FUNGSI KOMUNIKASI (POST) KE GAS
    // ==========================================
    async function sendDataToGAS(action, payload) {
        try {
            const requestData = {
                action: action,
                data: payload,
                pin: currentAdminPin // PIN otomatis disisipkan jika admin sedang aktif
            };

            const response = await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify(requestData)
            });
            const result = await response.json();
            
            if (result.status === "error") {
                alert("GAGAL: " + result.message);
                return false;
            }
            return true;
        } catch (error) {
            console.error("Error:", error);
            alert("Terjadi kesalahan jaringan.");
            return false;
        }
    }

    // ==========================================
    // INTERAKSI UI & MODAL
    // ==========================================
    
    // Klik Kategori
    document.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        currentCategory = card.dataset.category;
        bookSearchInput.value = '';
        const titleEl = card.querySelector('h3');
        detailTitle.textContent = titleEl ? titleEl.textContent : currentCategory;
        categoryView.classList.add('hidden');
        document.getElementById('stats-section').classList.add('hidden');
        document.getElementById('announcements-section').classList.add('hidden');
        detailView.classList.remove('hidden');
        window.scrollTo(0, 0);
        renderBooks();
      });
    });

    document.getElementById('back-btn').addEventListener('click', () => {
      detailView.classList.add('hidden');
      categoryView.classList.remove('hidden');
      document.getElementById('stats-section').classList.remove('hidden');
      document.getElementById('announcements-section').classList.remove('hidden');
    });

    // Pencarian
    const searchInput = document.getElementById('search-input');
    const cards = document.querySelectorAll('.category-card');
    searchInput.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      cards.forEach(card => { card.style.display = card.dataset.category.includes(q) ? '' : 'none'; });
    });
    bookSearchInput.addEventListener('input', () => renderBooks());

    // Modal Admin
    function showAdminModal(context) {
      adminContext = context;
      adminModal.classList.remove('hidden');
      adminPinInput.value = '';
      adminError.classList.add('hidden');
      adminPinInput.focus();
    }

    adminToggleBtn.addEventListener('click', () => {
        if(isAdminMode) {
            isAdminMode = false;
            currentAdminPin = "";
            adminFormContainer.classList.add('hidden');
            adminToggleBtn.classList.remove('text-amber-700');
            renderBooks();
        } else showAdminModal('book');
    });

    announceAdminBtn.addEventListener('click', () => {
        if(isAnnounceAdmin) {
            isAnnounceAdmin = false;
            currentAdminPin = "";
            announceFormContainer.classList.add('hidden');
            announceAdminBtn.classList.remove('text-amber-700');
            renderAnnouncements();
        } else showAdminModal('announce');
    });

    adminCancelBtn.addEventListener('click', () => adminModal.classList.add('hidden'));
    
    adminSubmitBtn.addEventListener('click', () => {
      const pin = adminPinInput.value.trim();
      if(pin === "") return;
      
      // Kita buka UI terlebih dahulu. Jika PIN salah, akan ditolak oleh backend saat klik "Tambah/Hapus".
      currentAdminPin = pin; 
      adminModal.classList.add('hidden');
      
      if (adminContext === 'book') {
          isAdminMode = true;
          adminFormContainer.classList.remove('hidden');
          adminToggleBtn.classList.add('text-amber-700');
          renderBooks();
      } else {
          isAnnounceAdmin = true;
          announceFormContainer.classList.remove('hidden');
          announceAdminBtn.classList.add('text-amber-700');
          renderAnnouncements();
      }
    });

    // Form Tambah Pengumuman
    announceForm.addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = announceForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Menyimpan...";

      const payload = {
        announcement_title: document.getElementById('announce-title-input').value.trim(),
        announcement_content: document.getElementById('announce-content-input').value.trim(),
        announcement_date: new Date().toISOString()
      };

      const success = await sendDataToGAS('addAnnouncement', payload);
      if (success) {
          announceForm.reset();
          loadDataFromDatabase();
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Publikasikan";
    });

    // Form Kunjungan Pembaca
    visitorCancelBtn.addEventListener('click', () => { visitorModal.classList.add('hidden'); pendingBook = null; });
    visitorForm.addEventListener('submit', async e => {
      e.preventDefault();
      if (!pendingBook) return;
      
      const submitBtn = visitorForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Memproses...";

      const payload = {
        visitor_name: document.getElementById('visitor-name-input').value.trim(),
        visitor_class: document.getElementById('visitor-class-input').value.trim(),
        visitor_book_title: pendingBook.title,
        visitor_date: new Date().toISOString()
      };

      await sendDataToGAS('addVisit', payload); 
      // Buka buku terlepas dari koneksi internet lambat/cepat agar UX bagus
      window.open(pendingBook.drive_link, '_blank'); 
      
      visitorModal.classList.add('hidden'); 
      visitorForm.reset(); 
      pendingBook = null;
      submitBtn.disabled = false;
      submitBtn.textContent = "Lanjut Baca";
      
      loadDataFromDatabase(); // Segarkan data leaderboard
    });

    // Form Tambah Buku
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Menyimpan...";

      let coverUrl = document.getElementById('book-cover').value.trim();
      // Auto-konversi link drive menjadi direct image link jika formatnya valid
      if(coverUrl.includes("drive.google.com/file/d/")) {
          const match = coverUrl.match(/\/file\/d\/([^/]+)/);
          if (match) coverUrl = `https://lh3.googleusercontent.com/d/${match[1]}=w400`;
      }

      const payload = {
        title: document.getElementById('book-title').value.trim(),
        author: document.getElementById('book-author').value.trim(),
        publisher: document.getElementById('book-publisher').value.trim(),
        year: document.getElementById('book-year').value.trim(),
        category: currentCategory,
        drive_link: document.getElementById('book-link').value.trim(),
        cover_url: coverUrl
      };

      const success = await sendDataToGAS('addBook', payload);
      if (success) {
          form.reset();
          loadDataFromDatabase();
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Tambah Buku";
    });

    // Mulai inisialisasi awal
    window.onload = () => {
        loadDataFromDatabase();
    };

