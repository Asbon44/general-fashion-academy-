// Firebase Configuration
const firebaseConfig = {
    databaseURL: "https://gfa-admission-portal-default-rtdb.firebaseio.com/",
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// State
let currentUser = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Nav & Sections
    const sections = document.querySelectorAll('.page-section');
    const navItems = document.querySelectorAll('.nav-item');
    const navLinks = document.querySelector('.nav-links');
    const mobileMenuBtn = document.querySelector('.mobile-menu');

    // 2. Navigation Logic
    window.navigateTo = function(sectionId) {
        // Hide all sections
        sections.forEach(sec => sec.classList.remove('active'));
        
        // Show target section
        const targetSec = document.getElementById(sectionId);
        if (targetSec) {
            targetSec.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Toggle Footer Visibility
        const footer = document.getElementById('main-footer');
        const isPortal = sectionId.includes('portal') || sectionId.includes('admin') || sectionId.includes('student') || sectionId.includes('classrep');
        if (footer) {
            footer.style.display = isPortal ? 'none' : 'block';
        }

        // Update Nav Menu active state
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-target') === sectionId) {
                item.classList.add('active');
            }
        });

        // Trigger Data Loaders
        if (sectionId === 'admin-section') loadAdminData();
        if (sectionId === 'student-section') loadStudentData();
        if (sectionId === 'classrep-section') loadClassrepData();
        
        // Close Mobile Menu
        if (navLinks) navLinks.classList.remove('active');
    };

    // Nav Item Clicks
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            navigateTo(target);
        });
    });

    // Mobile Menu Toggle
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // 3. Tab Logic (Generic for all tab systems)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            const container = e.target.closest('.login-container');
            const targetId = e.target.getAttribute('data-tab');
            
            // Switch tabs
            container.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            // Switch forms
            container.querySelectorAll('.login-form').forEach(form => form.classList.remove('active'));
            const targetForm = document.getElementById(targetId);
            if (targetForm) targetForm.classList.add('active');
        }

        // Portal Sidebar Nav
        const portalNavItem = e.target.closest('li[data-admin-tab], li[data-student-tab], li[data-classrep-tab]');
        if (portalNavItem) {
            const type = portalNavItem.hasAttribute('data-admin-tab') ? 'admin' : (portalNavItem.hasAttribute('data-student-tab') ? 'student' : 'classrep');
            const tabName = portalNavItem.getAttribute(`data-${type}-tab`);
            
            // UI Toggle
            portalNavItem.parentElement.querySelectorAll('li').forEach(li => li.classList.remove('active'));
            portalNavItem.classList.add('active');
            
            document.querySelectorAll(`.${type}-tab-content`).forEach(content => content.classList.remove('active'));
            const targetTab = document.getElementById(`${type}-${tabName}-tab`);
            if (targetTab) targetTab.classList.add('active');
        }
    });

    // 4. Lightbox Logic
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('gallery-item') || e.target.classList.contains('admission-row-img')) {
            const modal = document.getElementById('lightbox-modal');
            const img = document.getElementById('lightbox-img');
            if (modal && img) {
                img.src = e.target.src;
                modal.classList.add('active');
            }
        }
    });

    // 5. Auth Handlers
    // Admin Login
    const adminForm = document.getElementById('form-admin-login');
    if (adminForm) {
        adminForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const pwd = document.getElementById('admin-password').value;
            const errorMsg = document.getElementById('admin-login-error');
            if (pwd === "Admin123") {
                currentUser = { type: 'admin' };
                navigateTo('admin-section');
            } else {
                errorMsg.textContent = "Invalid Credentials";
            }
        });
    }

    // Student Login
    const studentLoginForm = document.getElementById('form-student-login');
    if (studentLoginForm) {
        studentLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentId = document.getElementById('student-id-login').value.trim().toUpperCase();
            const pwd = document.getElementById('student-password').value;
            const errorMsg = document.getElementById('student-login-error');
            
            try {
                const snapshot = await db.ref('students').once('value');
                const allStudents = snapshot.val();
                let found = null;
                for (let id in allStudents) {
                    if (allStudents[id].studentNumber === studentId) {
                        if (allStudents[id].password === pwd) {
                            found = { id, ...allStudents[id] };
                            break;
                        }
                    }
                }

                if (found) {
                    currentUser = { type: 'student', ...found };
                    navigateTo('student-section');
                } else {
                    errorMsg.textContent = "Invalid Student Number or password";
                }
            } catch (err) {
                errorMsg.textContent = "Error connecting to server";
            }
        });
    }

    // Student Register
    const studentRegForm = document.getElementById('form-student-register');
    if (studentRegForm) {
        studentRegForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const firstName = document.getElementById('reg-firstname').value;
            const surname = document.getElementById('reg-surname').value;
            const otherName = document.getElementById('reg-othername').value;
            const gender = document.getElementById('reg-gender').value;
            const level = document.getElementById('reg-level').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const passportFile = document.getElementById('reg-passport').files[0];
            const boardingChecked = document.querySelector('input[name="boarding-status"]:checked');
            const boardingStatus = boardingChecked ? boardingChecked.value : 'day';
            const errorMsg = document.getElementById('student-reg-error');

            try {
                const snap = await db.ref('students').orderByChild('email').equalTo(email).once('value');
                if (snap.exists()) {
                    errorMsg.textContent = "Email already in use";
                    return;
                }

                let base64 = "";
                if (passportFile) base64 = await fileToBase64(passportFile);

                // Use a transaction to ensure unique sequential student numbers across all devices
                const counterRef = db.ref('student_counter');
                const result = await counterRef.transaction((currentCount) => {
                    return (currentCount || 0) + 1;
                });

                if (!result.committed) {
                    throw new Error("Could not generate student number");
                }

                const newCount = result.snapshot.val();
                const studentNumber = `GFA${String(newCount).padStart(5, '0')}`;

                const studentData = {
                    name: `${firstName} ${surname}${otherName ? ' ' + otherName : ''}`,
                    firstName, surname, otherName, gender, level, email, password,
                    studentNumber,
                    passportPic: base64,
                    boarding: boardingStatus === 'boarder',
                    course: 'Not Assigned',
                    attendance: 0,
                    registeredAt: new Date().toISOString()
                };

                const newRef = db.ref('students').push();
                await newRef.set(studentData);
                currentUser = { type: 'student', id: newRef.key, ...studentData };
                navigateTo('student-section');
                alert(`Welcome to GFA! Your Student Number is: ${studentNumber}. Please use this to login.`);
            } catch (err) {
                errorMsg.textContent = "Registration failed. Check connection.";
            }
        });
    }

    // Admin: Add Student
    const adminAddStudentForm = document.getElementById('form-add-student');
    if (adminAddStudentForm) {
        adminAddStudentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('add-st-name').value;
            const email = document.getElementById('add-st-email').value;
            const pwd = document.getElementById('add-st-password').value;
            const course = document.getElementById('add-st-course').value;
            const boarding = document.getElementById('add-st-boarding').checked;

            const newRef = db.ref('students').push();
            await newRef.set({ name, email, password: pwd, course, boarding, registeredAt: new Date().toISOString() });
            closeModal('add-student-modal');
            e.target.reset();
            alert('Student added successfully');
        });
    }

    // Admin: Record Payment
    const adminAddPaymentForm = document.getElementById('form-add-payment');
    if (adminAddPaymentForm) {
        adminAddPaymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentId = document.getElementById('pay-st-id').value;
            const amount = document.getElementById('pay-amount').value;
            const method = document.getElementById('pay-method').value;
            const date = document.getElementById('pay-date').value;
            const type = document.getElementById('pay-type').value;

            // Save to Firebase
            const newRef = db.ref('payments').push();
            await newRef.set({ studentId, amount, method, date, type, createdAt: new Date().toISOString() });
            
            // Get student name for receipt
            const stName = document.querySelector(`#pay-st-id option[value="${studentId}"]`).textContent;

            // Populate Receipt
            document.getElementById('rec-no').textContent = `#GFA-${newRef.key.substring(1, 7).toUpperCase()}`;
            document.getElementById('rec-date').textContent = date;
            document.getElementById('rec-student').textContent = stName;
            document.getElementById('rec-method').textContent = method;
            document.getElementById('rec-amount').textContent = `GHC ${parseFloat(amount).toFixed(2)}`;

            // Setup Email to HQ Button
            const hqEmail = "generalfashionacademyaccra@gmail.com";
            document.getElementById('btn-send-hq').onclick = () => {
                const subject = `Payment Notification - ${stName}`;
                const body = `Official Receipt Details:%0A%0AStudent: ${stName}%0AAmount: GHC ${amount}%0ADate: ${date}%0AMethod: ${method}%0AReceipt No: #GFA-${newRef.key.substring(1, 7).toUpperCase()}%0A%0AGenerated via GFA Portal.`;
                window.location.href = `mailto:${hqEmail}?subject=${subject}&body=${body}`;
            };

            closeModal('add-payment-modal');
            e.target.reset();
            openModal('receipt-modal');
        });
    }

    // Admin: Post Announcement
    const adminAddAnnForm = document.getElementById('form-add-announcement');
    if (adminAddAnnForm) {
        adminAddAnnForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('ann-title').value;
            const message = document.getElementById('ann-message').value;

            const newRef = db.ref('announcements').push();
            await newRef.set({
                title,
                message,
                date: new Date().toLocaleDateString(),
                createdAt: new Date().toISOString()
            });

            e.target.reset();
            alert('Announcement posted to students!');
        });
    }

    // Student: Submit Complaint
    const studentCompForm = document.getElementById('form-student-complaint');
    if (studentCompForm) {
        studentCompForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('comp-subject').value;
            const message = document.getElementById('comp-message').value;

            if (!currentUser) return;

            const complaintData = {
                studentId: currentUser.id,
                studentName: currentUser.name,
                studentEmail: currentUser.email,
                subject,
                message,
                createdAt: new Date().toISOString()
            };

            try {
                // 1. Save to Firebase for admin to see
                await db.ref('complaints').push(complaintData);

                alert('Your complaint has been submitted successfully to the administration.');
                e.target.reset();
            } catch (err) {
                alert('Failed to submit complaint. Please check your connection.');
            }
        });
    }

    // Student: Submit Attachment
    const studentAttForm = document.getElementById('form-student-attachment');
    if (studentAttForm) {
        studentAttForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const shopName = document.getElementById('att-shop-name').value;
            const town = document.getElementById('att-town').value;
            const region = document.getElementById('att-region').value;
            const district = document.getElementById('att-district').value;
            const shopAddress = document.getElementById('att-shop-address').value;
            const ownerPhone = document.getElementById('att-owner-phone').value;

            const attachmentData = {
                studentId: currentUser.id,
                studentName: currentUser.name,
                studentEmail: currentUser.email,
                shopName,
                town,
                region,
                district,
                shopAddress,
                ownerPhone,
                createdAt: new Date().toISOString()
            };

            try {
                await db.ref('attachments').push(attachmentData);
                alert('Attachment details submitted successfully!');
                e.target.reset();
            } catch (err) {
                alert('Failed to submit attachment details. Please check your connection.');
            }
        });
    }

    // Class Rep: Send Info to Admin
    const classrepAdminForm = document.getElementById('form-classrep-to-admin');
    if (classrepAdminForm) {
        classrepAdminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser || currentUser.type !== 'classrep') return;
            
            const subject = document.getElementById('cr-admin-subject').value;
            const message = document.getElementById('cr-admin-message').value;

            const reportData = {
                level: currentUser.level,
                subject,
                message,
                createdAt: new Date().toISOString()
            };

            try {
                await db.ref('classrep_reports').push(reportData);
                alert('Information has been successfully sent to the Admin.');
                e.target.reset();
            } catch (err) {
                alert('Failed to send information. Please check your connection.');
            }
        });
    }

    loadGallery();
    startHeroSlideshow();
    startPortalSlideshow();
});

function startPortalSlideshow() {
    const studentBg = document.querySelector('.portal-bg-student');
    const adminBg = document.querySelector('.portal-bg-admin');
    
    const images = [
        "gallery_1/IMG-20260429-WA0019.jpg",
        "gallery_1/IMG-20260429-WA0025.jpg",
        "gallery_1/IMG-20260429-WA0030.jpg",
        "gallery_1/IMG-20260429-WA0039.jpg",
        "gallery_1/IMG-20260429-WA0045.jpg"
    ];
    let currentIndex = 0;

    setInterval(() => {
        currentIndex = (currentIndex + 1) % images.length;
        const img = images[currentIndex];
        
        if (studentBg) {
            studentBg.style.background = `linear-gradient(rgba(10, 37, 64, 0.8), rgba(10, 37, 64, 0.8)), url('${img}') center top/cover no-repeat`;
        }
        if (adminBg) {
            adminBg.style.background = `linear-gradient(rgba(10, 37, 64, 0.8), rgba(10, 37, 64, 0.8)), url('${img}') center top/cover no-repeat`;
        }
    }, 5000);
}

function startHeroSlideshow() {
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const images = [
        "gallery_1/IMG-20260429-WA0039.jpg",
        "gallery_1/IMG-20260429-WA0045.jpg",
        "gallery_1/IMG-20260429-WA0020.jpg",
        "gallery_1/IMG-20260429-WA0030.jpg",
        "gallery_1/IMG-20260429-WA0051.jpg"
    ];
    let currentIndex = 0;

    const changeBg = () => {
        hero.style.background = `linear-gradient(rgba(10, 37, 64, 0.7), rgba(10, 37, 64, 0.7)), url('${images[currentIndex]}') center top/cover no-repeat`;
        currentIndex = (currentIndex + 1) % images.length;
    };

    setInterval(changeBg, 4000);
}

// Helper Functions
function loadGallery() {
    const galleryContainer = document.getElementById('gallery-container');
    if (!galleryContainer) return;
    
    galleryContainer.innerHTML = '';
    // Load images from 19 to 51
    for (let i = 19; i <= 51; i++) {
        const img = document.createElement('img');
        img.src = `gallery_1/IMG-20260429-WA00${i}.jpg`;
        img.className = 'gallery-item';
        img.onerror = () => img.remove();
        galleryContainer.appendChild(img);
    }
}

async function loadAdminData() {
    if (!currentUser || currentUser.type !== 'admin') return;
    db.ref('students').on('value', snap => {
        const list = document.getElementById('admin-students-list');
        const select = document.getElementById('pay-st-id');
        if (!list) return;
        list.innerHTML = '';
        if (select) select.innerHTML = '<option value="">Select Student...</option>';
        
        let total = 0, boarding = 0, day = 0;
        const data = snap.val();
        for (let id in data) {
            total++;
            if (data[id].boarding) boarding++;
            else day++;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${data[id].studentNumber || 'N/A'}</strong></td><td>${data[id].name}</td><td>${data[id].course}</td><td>Level ${data[id].level || 'N/A'}</td><td>${data[id].boarding?'Boarder':'Day Student'}</td><td><button class="small-btn primary-btn" style="padding:5px 10px; margin-right:5px; border-radius:4px; cursor:pointer;" onclick="promoteStudent('${id}', '${data[id].level || '100'}')">Update Level</button><button class="small-btn" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" onclick="deleteStudent('${id}')">Delete</button></td>`;
            list.appendChild(tr);
            if (select) {
                const opt = document.createElement('option');
                opt.value = id; opt.textContent = data[id].name;
                select.appendChild(opt);
            }
        }
        document.getElementById('stat-total-students').textContent = total;
        document.getElementById('stat-boarding').textContent = boarding;
        document.getElementById('stat-day').textContent = day;
    });

    db.ref('payments').on('value', async snap => {
        const list = document.getElementById('admin-payments-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        const stSnap = await db.ref('students').once('value');
        const stData = stSnap.val() || {};
        for (let id in data) {
            const p = data[id];
            const name = stData[p.studentId]?.name || 'Unknown';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${name}</td><td>${p.type || 'Fees'}</td><td>GHC ${p.amount}</td><td>${p.date}</td><td>${p.method}</td><td>
                <a href="mailto:${stData[p.studentId]?.email}?subject=Receipt&body=Received GHC ${p.amount} for ${p.type || 'Fees'}" class="small-btn primary-btn" style="text-decoration:none; margin-right:5px;"><i class="fas fa-paper-plane"></i></a>
                <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" onclick="deletePayment('${id}')"><i class="fas fa-trash"></i></button>
            </td>`;
            list.appendChild(tr);
        }
    });

    // Load Admin Announcements
    db.ref('announcements').on('value', snap => {
        const list = document.getElementById('admin-announcements-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const ann = data[id];
                const div = document.createElement('div');
                div.className = 'glass-card mb-3';
                div.style.padding = '15px';
                div.innerHTML = `
                    <div class="flex-between">
                        <strong>${ann.title}</strong>
                        <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px;" onclick="deleteAnnouncement('${id}')">Delete</button>
                    </div>
                    <p style="font-size:0.9rem; margin-top:5px;">${ann.message}</p>
                    <small class="text-muted">${ann.date}</small>
                `;
                list.appendChild(div);
            }
        } else {
            list.innerHTML = '<p class="text-muted">No announcements found.</p>';
        }
    });

    // Load Admin Complaints
    db.ref('complaints').on('value', snap => {
        const list = document.getElementById('admin-complaints-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const comp = data[id];
                const div = document.createElement('div');
                div.className = 'glass-card mb-3';
                div.style.padding = '20px';
                div.style.borderLeft = '5px solid #dc3545';
                div.innerHTML = `
                    <div class="flex-between">
                        <strong>${comp.subject}</strong>
                        <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px;" onclick="deleteComplaint('${id}')">Archive</button>
                    </div>
                    <p style="margin: 10px 0; font-size:0.95rem;">${comp.message}</p>
                    <div class="flex-between" style="font-size:0.8rem; color:#666;">
                        <span>From: ${comp.studentName} (${comp.studentEmail})</span>
                        <span>${new Date(comp.createdAt).toLocaleDateString()}</span>
                    </div>
                `;
                list.appendChild(div);
            }
        } else {
            list.innerHTML = '<p class="text-muted">No complaints at the moment.</p>';
        }
    });

    // Load Class Rep Reports
    db.ref('classrep_reports').on('value', snap => {
        const list = document.getElementById('admin-classrep-reports-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const rep = data[id];
                const div = document.createElement('div');
                div.className = 'glass-card mb-3';
                div.style.padding = '20px';
                div.style.borderLeft = '5px solid var(--accent-gold)';
                div.innerHTML = `
                    <div class="flex-between">
                        <strong>${rep.subject}</strong>
                        <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px;" onclick="deleteClassrepReport('${id}')">Archive</button>
                    </div>
                    <p style="margin: 10px 0; font-size:0.95rem;">${rep.message}</p>
                    <div class="flex-between" style="font-size:0.8rem; color:#666;">
                        <span>From: Level ${rep.level} Class Rep</span>
                        <span>${new Date(rep.createdAt).toLocaleDateString()}</span>
                    </div>
                `;
                list.appendChild(div);
            }
        } else {
            list.innerHTML = '<p class="text-muted">No information received yet.</p>';
        }
    });

    // Load Admin Attachments
    db.ref('attachments').on('value', snap => {
        const list = document.getElementById('admin-attachments-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const att = data[id];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="font-weight:600;">${att.studentName}</div>
                        <div style="font-size:0.8rem; color:#666;">${att.studentEmail}</div>
                    </td>
                    <td>${att.shopName}</td>
                    <td>${att.town}, ${att.region}</td>
                    <td>${att.ownerPhone}</td>
                    <td>${new Date(att.createdAt).toLocaleDateString()}</td>
                    <td>
                        <button class="small-btn primary-btn" onclick="viewAttachmentDetails('${id}')" style="margin-right:5px;"><i class="fas fa-eye"></i></button>
                        <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px;" onclick="deleteAttachment('${id}')"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                list.appendChild(tr);
            }
        } else {
            list.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No attachments found.</td></tr>';
        }
    });
}

window.viewAttachmentDetails = async (id) => {
    const snap = await db.ref('attachments/' + id).once('value');
    const att = snap.val();
    if (att) {
        alert(`Attachment Details:\n\nStudent: ${att.studentName}\nShop: ${att.shopName}\nTown: ${att.town}\nRegion: ${att.region}\nDistrict: ${att.district}\nAddress: ${att.shopAddress}\nOwner Phone: ${att.ownerPhone}`);
    }
}

window.deleteAttachment = async (id) => {
    if(confirm('Delete this attachment record?')) {
        await db.ref('attachments/' + id).remove();
    }
}

window.deleteComplaint = async (id) => {
    if(confirm('Archive this complaint?')) {
        await db.ref('complaints/' + id).remove();
    }
}

window.deleteClassrepReport = async (id) => {
    if(confirm('Archive this information?')) {
        await db.ref('classrep_reports/' + id).remove();
    }
}

window.deleteAnnouncement = async (id) => {
    if(confirm('Delete this announcement?')) {
        await db.ref('announcements/' + id).remove();
    }
}

function loadStudentData() {
    if (!currentUser || currentUser.type !== 'student') return;
    const mini = document.querySelector('.student-profile-mini');
    if (mini) {
        mini.innerHTML = `<img src="${currentUser.passportPic || ''}" class="student-portal-pic" onerror="this.src='https://via.placeholder.com/100'"><span id="st-portal-name">${currentUser.name}</span>`;
    }
    document.getElementById('st-welcome-name').textContent = currentUser.firstName || currentUser.name;
    document.getElementById('st-profile-firstname').textContent = currentUser.firstName || '...';
    document.getElementById('st-profile-surname').textContent = currentUser.surname || '...';
    document.getElementById('st-profile-othername').textContent = currentUser.otherName || 'None';
    document.getElementById('st-profile-gender').textContent = currentUser.gender || 'Not Set';
    document.getElementById('st-profile-level').textContent = currentUser.level ? 'Level ' + currentUser.level : 'Not Set';
    document.getElementById('st-profile-attendance').textContent = `${currentUser.attendance || 0} times`;
    document.getElementById('st-profile-course').textContent = currentUser.course || 'Not Assigned';
    document.getElementById('st-profile-boarding').textContent = currentUser.boarding ? 'Boarder' : 'Day Student';
    
    // Load Student's Personal Payments
    db.ref('payments').on('value', snap => {
        const list = document.getElementById('st-payments-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        let found = false;
        if (data) {
            for (let id in data) {
                const p = data[id];
                if (p.studentId === currentUser.id) {
                    found = true;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${p.type || 'Fees'}</strong></td>
                        <td>GHC ${p.amount}</td>
                        <td>${p.date}</td>
                        <td>${p.method}</td>
                    `;
                    list.appendChild(tr);
                }
            }
        }
        if (!found) {
            list.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No payment records found.</td></tr>';
        }
    });

    // Load Live Announcements for Student
    db.ref('announcements').on('value', snap => {
        const list = document.getElementById('st-announcements-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const ann = data[id];
                const div = document.createElement('div');
                div.className = 'glass-card mb-4';
                div.style.padding = '20px';
                div.innerHTML = `
                    <h3 style="color:var(--primary-blue); margin-bottom:10px;"><i class="fas fa-bell"></i> ${ann.title}</h3>
                    <p style="line-height:1.6;">${ann.message}</p>
                    <div style="margin-top:15px; font-size:0.8rem; color:#888;">Posted on: ${ann.date}</div>
                `;
                list.appendChild(div);
            }
        } else {
            list.innerHTML = '<div class="glass-card"><p class="text-muted">No new announcements at this time.</p></div>';
        }
    });

    startStudentSlideshow();
}

let slideshowInterval;
function startStudentSlideshow() {
    const slideImg = document.getElementById('st-slide-img');
    if (!slideImg) return;

    const images = [
        "gallery_1/IMG-20260429-WA0030.jpg",
        "gallery_1/IMG-20260429-WA0035.jpg",
        "gallery_1/IMG-20260429-WA0045.jpg"
    ];
    let currentIndex = 0;

    const changeSlide = () => {
        slideImg.src = images[currentIndex];
        currentIndex = (currentIndex + 1) % images.length;
    };

    if (slideshowInterval) clearInterval(slideshowInterval);
    changeSlide();
    slideshowInterval = setInterval(changeSlide, 4000);
}

window.logout = () => { currentUser = null; navigateTo('home-section'); };
window.openModal = id => document.getElementById(id).classList.add('active');
window.closeModal = id => document.getElementById(id).classList.remove('active');
window.deleteStudent = id => confirm('Delete student?') && db.ref('students/'+id).remove();
window.deletePayment = id => confirm('Are you sure you want to delete this payment record? This will also remove it from the student portal.') && db.ref('payments/'+id).remove();

window.promoteStudent = async (id, currentLevel) => {
    let newLevel = prompt("Enter new level for this student (e.g., 100 or 200):", currentLevel);
    if (newLevel) {
        await db.ref('students/' + id).update({ level: newLevel });
        alert("Student level updated successfully!");
    }
}

window.resetClassAttendance = async () => {
    if (!currentUser || currentUser.type !== 'classrep') return;
    if (confirm(`Are you sure you want to delete the semester's register and reset all attendance to 0 for Level ${currentUser.level}?`)) {
        const snap = await db.ref('students').once('value');
        const data = snap.val();
        if (data) {
            const updates = {};
            for (let id in data) {
                if (data[id].level === currentUser.level) {
                    updates[id + '/attendance'] = 0;
                    updates[id + '/attendanceLogs'] = null;
                }
            }
            await db.ref('students').update(updates);
            alert(`Level ${currentUser.level} student attendance registers have been reset.`);
        }
    }
}

function fileToBase64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result); r.onerror = e => rej(e); }); }

// Class Rep Portal Functions
window.showClassrepLogin = (level) => {
    document.getElementById('classrep-login-form').style.display = 'block';
    document.getElementById('classrep-level-title').textContent = `Level ${level} Login`;
    document.getElementById('classrep-level-input').value = level;
    document.getElementById('classrep-error').textContent = '';
};

window.loginClassrep = () => {
    const level = document.getElementById('classrep-level-input').value;
    const pwd = document.getElementById('classrep-password').value;
    const errorMsg = document.getElementById('classrep-error');
    
    if ((level === '100' && pwd === 'Classrep100') || (level === '200' && pwd === 'Classrep200')) {
        currentUser = { type: 'classrep', level: level };
        closeModal('classrep-modal');
        document.getElementById('classrep-password').value = '';
        navigateTo('classrep-section');
    } else {
        errorMsg.textContent = 'Invalid Password';
    }
};

window.markPresent = async (studentId) => {
    if (!currentUser || currentUser.type !== 'classrep') return;
    const day = document.getElementById('classrep-day-select').value;
    try {
        const ref = db.ref('students/' + studentId);
        const snap = await ref.once('value');
        const data = snap.val();
        if (data) {
            const today = new Date().toISOString().split('T')[0];
            const logs = data.attendanceLogs || {};
            
            let newAttendance = data.attendance || 0;
            if (!logs[today]) {
                newAttendance += 1;
            }
            
            logs[today] = { day: day, timestamp: new Date().toISOString() };
            await ref.update({ attendance: newAttendance, attendanceLogs: logs });
            alert(`Student marked as present for ${day} (${today})!`);
        }
    } catch (e) {
        alert('Error marking present');
    }
};

window.loadAttendanceHistory = async () => {
    if (!currentUser || currentUser.type !== 'classrep') return;
    const selectedDate = document.getElementById('classrep-history-date').value;
    const list = document.getElementById('classrep-history-list');
    if (!list) return;
    
    if (!selectedDate) {
        list.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Please select a date to view attendance.</td></tr>';
        return;
    }
    
    const snap = await db.ref('students').once('value');
    list.innerHTML = '';
    const data = snap.val();
    let foundStudents = false;
    
    if (data) {
        for (let id in data) {
            if (data[id].level === currentUser.level) {
                foundStudents = true;
                const student = data[id];
                const logs = student.attendanceLogs || {};
                const isPresent = !!logs[selectedDate];
                const dayMarked = isPresent ? logs[selectedDate].day : '-';
                const statusHtml = isPresent ? '<span style="color: #28a745; font-weight: bold;"><i class="fas fa-check-circle"></i> Present</span>' : '<span style="color: #dc3545; font-weight: bold;"><i class="fas fa-times-circle"></i> Absent</span>';
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${student.studentNumber || 'N/A'}</strong></td>
                    <td>${student.name}</td>
                    <td>${dayMarked}</td>
                    <td>${statusHtml}</td>
                `;
                list.appendChild(tr);
            }
        }
    }
    
    if (!foundStudents) {
        list.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No students found in Level ${currentUser.level}.</td></tr>`;
    }
};

window.loadClassrepData = () => {
    if (!currentUser || currentUser.type !== 'classrep') return;
    document.getElementById('classrep-portal-name').textContent = `Level ${currentUser.level} Rep`;
    const today = new Date().toISOString().split('T')[0];
    
    db.ref('students').on('value', snap => {
        const list = document.getElementById('classrep-students-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        let found = false;
        for (let id in data) {
            if (data[id].level === currentUser.level) {
                found = true;
                const logs = data[id].attendanceLogs || {};
                const isPresentToday = !!logs[today];
                const btnHtml = isPresentToday ? 
                    `<button class="small-btn" style="background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px;" disabled><i class="fas fa-check"></i> Marked</button>` :
                    `<button class="small-btn primary-btn" onclick="markPresent('${id}')">Mark Present</button>`;
                    
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${data[id].studentNumber || 'N/A'}</strong></td>
                    <td>${data[id].name}</td>
                    <td>Level ${data[id].level}</td>
                    <td>${btnHtml}</td>
                `;
                list.appendChild(tr);
            }
        }
        if (!found) {
            list.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No students found in this level.</td></tr>';
        }
    });
};
