/* ==========================================================================
   AuraAttend - Premium Javascript Application
   Engine: Firebase v10 Realtime Database, Web Audio API, html5-qrcode
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  child, 
  onValue, 
  update, 
  remove, 
  push,
  query,
  orderByChild,
  equalTo,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyA_GTm9WLvvB34kynCRVULsLv_WiOR_JQ0",
  authDomain: "fullauraattendance.firebaseapp.com",
  databaseURL: "https://fullauraattendance-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "fullauraattendance",
  storageBucket: "fullauraattendance.firebasestorage.app",
  messagingSenderId: "206869831935",
  appId: "1:206869831935:web:5e2d93bb2456bc4cae2cca"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

// --- Server Time Synchronization ---
let serverTimeOffset = 0;
const offsetRef = ref(db, ".info/serverTimeOffset");
onValue(offsetRef, (snapshot) => {
  serverTimeOffset = snapshot.val() || 0;
  console.log(`[Time Sync] Server time offset calculated: ${serverTimeOffset}ms`);
});

// Helper function to get current date synchronized with Firebase server time
function getSyncedDate() {
  return new Date(Date.now() + serverTimeOffset);
}

// --- Application State ---
let state = {
  currentUser: null,      // Firebase Auth User (for Students)
  sessionUser: null,      // Database-authenticated User (for Teachers/Admin)
  userRole: null,         // 'student' | 'teacher' | 'admin'
  studentProfile: null,   // Student DB profile details
  teacherProfile: null,   // Teacher DB profile details
  currentView: 'auth',    // 'auth' | 'student' | 'teacher' | 'admin'
  
  // Student State
  activeStudentSubject: null,
  qrInterval: null,
  qrTimeRemaining: 10,
  
  // Teacher State
  activeTeacherSubject: null,
  html5QrScanner: null,
  isCameraRunning: false,
  isScanThrottled: false, // Throttling state for teacher QR code scanner
  scannedAttendees: [],   // Log of scanned students today
  
  // Calendar Navigation
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  
  // Global Data Cache
  teachers: {},
  subjects: {},
  students: {},
  attendance: {},
  
  // Unsubscribe listeners cache
  dbListeners: []
};

// --- DOM Elements ---
const el = {
  // Views
  viewAuth: document.getElementById('view-auth'),
  viewStudent: document.getElementById('view-student'),
  viewTeacher: document.getElementById('view-teacher'),
  viewAdmin: document.getElementById('view-admin'),
  
  // Auth Form Toggles & Buttons
  roleTabs: document.querySelectorAll('.role-tab'),
  authForms: document.querySelectorAll('.auth-form'),
  btnGoogleSignin: document.getElementById('btn-google-signin'),
  btnTeacherLogin: document.getElementById('btn-teacher-login'),
  btnAdminLogin: document.getElementById('btn-admin-login'),
  
  // Auth Inputs
  teacherEmail: document.getElementById('teacher-email'),
  teacherPassword: document.getElementById('teacher-password'),
  adminEmail: document.getElementById('admin-email'),
  adminPassword: document.getElementById('admin-password'),
  studentUsername: document.getElementById('student-username'),
  studentPassword: document.getElementById('student-password'),
  btnStudentPasswordLogin: document.getElementById('btn-student-password-login'),
  
  // Student Login Tabs
  tabGoogleLogin: document.getElementById('tab-google-login'),
  tabCredentialsLogin: document.getElementById('tab-credentials-login'),
  studentPanelGoogle: document.getElementById('student-panel-google'),
  studentPanelCredentials: document.getElementById('student-panel-credentials'),
  
  // Logouts & Profile Actions
  btnStudentLogout: document.getElementById('btn-student-logout'),
  btnStudentChangePassword: document.getElementById('btn-student-change-password'),
  btnTeacherLogout: document.getElementById('btn-teacher-logout'),
  btnAdminLogout: document.getElementById('btn-admin-logout'),
  
  // Student Dashboard
  studentAvatar: document.getElementById('student-avatar'),
  studentNameDisplay: document.getElementById('student-name-display'),
  studentIdDisplay: document.getElementById('student-id-display'),
  studentSubjectList: document.getElementById('student-subject-list'),
  studentQrCard: document.getElementById('student-qr-card'),
  btnCloseQr: document.getElementById('btn-close-qr'),
  qrSubjectTitle: document.getElementById('qr-subject-title'),
  studentQrCanvas: document.getElementById('student-qr-canvas'),
  studentQrContainer: document.getElementById('student-qr-container'),
  qrTimerText: document.getElementById('qr-timer-text'),
  qrDetailId: document.getElementById('qr-detail-id'),
  qrDetailName: document.getElementById('qr-detail-name'),
  qrDetailDate: document.getElementById('qr-detail-date'),
  qrDetailRoom: document.getElementById('qr-detail-room'),
  studentStatRate: document.getElementById('student-stat-rate'),
  studentStatPresent: document.getElementById('student-stat-present'),
  studentStatAbsent: document.getElementById('student-stat-absent'),
  studentCalendarTitle: document.getElementById('student-calendar-title'),
  studentCalendarDays: document.getElementById('student-calendar-days'),
  studentCalPrev: document.getElementById('student-cal-prev'),
  studentCalToday: document.getElementById('student-cal-today'),
  studentCalNext: document.getElementById('student-cal-next'),
  
  // Teacher Dashboard
  teacherNameDisplay: document.getElementById('teacher-name-display'),
  teacherEmailDisplay: document.getElementById('teacher-email-display'),
  teacherActiveSubject: document.getElementById('teacher-active-subject'),
  teacherSessionInfo: document.getElementById('teacher-session-info'),
  sessionInfoTime: document.getElementById('session-info-time'),
  sessionInfoRoom: document.getElementById('session-info-room'),
  sessionInfoDay: document.getElementById('session-info-day'),
  currentSessionDate: document.getElementById('current-session-date'),
  attendeeCount: document.getElementById('attendee-count'),
  teacherAttendeeList: document.getElementById('teacher-attendee-list'),
  btnExportAttendance: document.getElementById('btn-export-attendance'),
  teacherCalendarTitle: document.getElementById('teacher-calendar-title'),
  teacherCalendarDays: document.getElementById('teacher-calendar-days'),
  teacherCalPrev: document.getElementById('teacher-cal-prev'),
  teacherCalToday: document.getElementById('teacher-cal-today'),
  teacherCalNext: document.getElementById('teacher-cal-next'),
  btnToggleCamera: document.getElementById('btn-toggle-camera'),
  scannerLaser: document.getElementById('scanner-laser'),
  scannerStatusText: document.getElementById('scanner-status-text'),
  scanFeedbackBox: document.getElementById('scan-feedback-box'),
  feedbackIcon: document.getElementById('feedback-icon'),
  feedbackTitle: document.getElementById('feedback-title'),
  feedbackDesc: document.getElementById('feedback-desc'),
  
  // Admin Dashboard
  adminTabs: document.querySelectorAll('.admin-tab'),
  adminPanels: document.querySelectorAll('.admin-panel'),
  addTeacherForm: document.getElementById('add-teacher-form'),
  addSubjectForm: document.getElementById('add-subject-form'),
  addStudentForm: document.getElementById('add-student-form'),
  newStudentFirstName: document.getElementById('new-student-first-name'),
  newStudentLastName: document.getElementById('new-student-last-name'),
  newStudentMiddleName: document.getElementById('new-student-middle-name'),
  newStudentId: document.getElementById('new-student-id'),
  newStudentPassword: document.getElementById('new-student-password'),
  adminTeachersTbody: document.getElementById('admin-teachers-tbody'),
  adminSubjectsTbody: document.getElementById('admin-subjects-tbody'),
  subjectTeacherSelect: document.getElementById('subject-teacher'),
  adminPasswordForm: document.getElementById('admin-password-form'),
  adminStatStudents: document.getElementById('admin-stat-students'),
  adminStatTeachers: document.getElementById('admin-stat-teachers'),
  adminStatSubjects: document.getElementById('admin-stat-subjects'),
  adminStatRecords: document.getElementById('admin-stat-records'),
  adminStudentsTbody: document.getElementById('admin-students-tbody'),
  
  // Modals
  modalStudentRegistration: document.getElementById('modal-student-registration'),
  studentRegistrationForm: document.getElementById('student-registration-form'),
  modalDayDetails: document.getElementById('modal-day-details'),
  dayModalTitle: document.getElementById('day-modal-title'),
  dayModalSubtitle: document.getElementById('day-modal-subtitle'),
  dayModalContent: document.getElementById('day-modal-content'),
  btnCloseDayModal: document.getElementById('btn-close-day-modal'),
  modalChangeTeacherPassword: document.getElementById('modal-change-teacher-password'),
  teacherPwdChangeForm: document.getElementById('teacher-pwd-change-form'),
  btnCloseTeacherPwdModal: document.getElementById('btn-close-teacher-pwd-modal'),
  pwdModalTeacherName: document.getElementById('pwd-modal-teacher-name'),
  pwdModalTeacherId: document.getElementById('pwd-modal-teacher-id'),
  modalFullscreenQr: document.getElementById('modal-fullscreen-qr'),
  fullscreenQrCanvas: document.getElementById('fullscreen-qr-canvas'),
  fullscreenQrTimerText: document.getElementById('fullscreen-qr-timer-text'),
  
  // Student & Admin Modals
  modalStudentChangePassword: document.getElementById('modal-student-change-password'),
  btnCloseStudentChangePassword: document.getElementById('btn-close-student-change-password'),
  studentChangePasswordForm: document.getElementById('student-change-password-form'),
  studentCurrentPassword: document.getElementById('student-current-password'),
  studentNewPassword: document.getElementById('student-new-password'),
  studentConfirmPassword: document.getElementById('student-confirm-password'),
  modalResetStudentPassword: document.getElementById('modal-reset-student-password'),
  btnCloseResetStudentPassword: document.getElementById('btn-close-reset-student-password'),
  resetStudentPasswordForm: document.getElementById('reset-student-password-form'),
  resetStudentUid: document.getElementById('reset-student-uid'),
  resetStudentNewPassword: document.getElementById('reset-student-new-password'),
  resetStudentPwdSubtitle: document.getElementById('reset-student-pwd-subtitle'),

  // New Admin Student Management Modals
  modalEditStudent: document.getElementById('modal-edit-student'),
  btnCloseEditStudentModal: document.getElementById('btn-close-edit-student-modal'),
  editStudentForm: document.getElementById('edit-student-form'),
  editStudentUid: document.getElementById('edit-student-uid'),
  editStudentFirstName: document.getElementById('edit-student-first-name'),
  editStudentMiddleName: document.getElementById('edit-student-middle-name'),
  editStudentLastName: document.getElementById('edit-student-last-name'),
  editStudentIdNumber: document.getElementById('edit-student-id-number'),

  modalAssignSubjects: document.getElementById('modal-assign-subjects'),
  btnCloseAssignSubjectsModal: document.getElementById('btn-close-assign-subjects-modal'),
  assignSubjectsForm: document.getElementById('assign-subjects-form'),
  assignSubjectsStudentUid: document.getElementById('assign-subjects-student-uid'),
  assignSubjectsList: document.getElementById('assign-subjects-list'),
  assignSubjectsStudentName: document.getElementById('assign-subjects-student-name'),

  modalDeleteStudentConfirm: document.getElementById('modal-delete-student-confirm'),
  btnCloseDeleteStudentModal: document.getElementById('btn-close-delete-student-modal'),
  btnCancelDeleteStudent: document.getElementById('btn-cancel-delete-student'),
  deleteStudentForm: document.getElementById('delete-student-form'),
  deleteStudentUid: document.getElementById('delete-student-uid'),
  deleteStudentConfirmName: document.getElementById('delete-student-confirm-name'),
  
  // New elements for teacher join QR and student join scanner
  btnTeacherJoinQr: document.getElementById('btn-teacher-join-qr'),
  btnStudentJoinScan: document.getElementById('btn-student-join-scan'),
  modalTeacherJoinQr: document.getElementById('modal-teacher-join-qr'),
  teacherJoinQrCanvas: document.getElementById('teacher-join-qr-canvas'),
  teacherJoinQrSelect: document.getElementById('teacher-join-qr-select'),
  teacherJoinQrTimer: document.getElementById('teacher-join-qr-timer'),
  btnCloseTeacherJoinQr: document.getElementById('btn-close-teacher-join-qr'),
  teacherJoinQrSubjectName: document.getElementById('teacher-join-qr-subject-name'),
  modalStudentJoinScanner: document.getElementById('modal-student-join-scanner'),
  studentJoinReader: document.getElementById('student-join-reader'),
  btnCloseStudentJoinScanner: document.getElementById('btn-close-student-join-scanner'),
  studentJoinStatus: document.getElementById('student-join-status'),

  // Attendance QR (Teacher generates, Student scans)
  btnTeacherAttendanceQr: document.getElementById('btn-teacher-attendance-qr'),
  modalTeacherAttendanceQr: document.getElementById('modal-teacher-attendance-qr'),
  teacherAttendanceQrCanvas: document.getElementById('teacher-attendance-qr-canvas'),
  teacherAttendanceQrSelect: document.getElementById('teacher-attendance-qr-select'),
  teacherAttendanceQrTimer: document.getElementById('teacher-attendance-qr-timer'),
  teacherAttendanceQrSubjectName: document.getElementById('teacher-attendance-qr-subject-name'),
  btnCloseTeacherAttendanceQr: document.getElementById('btn-close-teacher-attendance-qr'),
  btnStudentScanAttendance: document.getElementById('btn-student-scan-attendance'),
  modalStudentAttendanceScanner: document.getElementById('modal-student-attendance-scanner'),
  studentAttendanceReader: document.getElementById('student-attendance-reader'),
  btnCloseStudentAttendanceScanner: document.getElementById('btn-close-student-attendance-scanner'),
  studentAttendanceStatus: document.getElementById('student-attendance-status'),
  
  // Toast
  toast: document.getElementById('toast')
};

// --- Security & Hashing Helpers ---

// Generate a random cryptographic salt
function generateSalt(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Compute SHA-256 hash using browser native Web Cryptography API
async function hashPassword(password, salt) {
  const saltedMsg = password + salt;
  const msgBuffer = new TextEncoder().encode(saltedMsg);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// ================= INITIALIZATION =================
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  setupEventListeners();

  // Real-time connection status listener
  const connectedRef = ref(db, '.info/connected');
  onValue(connectedRef, (snap) => {
    const isConnected = snap.val() === true;
    const statusEl = document.getElementById('global-connection-status');
    const textEl = document.getElementById('connection-text');
    if (statusEl && textEl) {
      if (isConnected) {
        statusEl.classList.add('connected');
        statusEl.classList.remove('disconnected');
        textEl.textContent = 'Online';
      } else {
        statusEl.classList.add('disconnected');
        statusEl.classList.remove('connected');
        textEl.textContent = 'Offline';
      }
    }
  });
  
  // Register Service Worker for offline/slow network support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered successfully with scope:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  }
  
  // Check for active local sessions first (Teachers / Admin)
  const savedSession = localStorage.getItem('auraattend_session');
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      state.sessionUser = session.user;
      state.userRole = session.role;
      
      if (state.userRole === 'teacher') {
        state.teacherProfile = session.user;
        routeToView('teacher');
        initTeacherDashboard();
      } else if (state.userRole === 'admin') {
        routeToView('admin');
        initAdminDashboard();
      } else if (state.userRole === 'student') {
        state.studentProfile = session.user;
        routeToView('student');
        initStudentDashboard();
      }
    } catch (e) {
      console.error("Failed to parse saved session", e);
      localStorage.removeItem('auraattend_session');
    }
  }

  // Handle Google Sign-in redirect result (for mobile users)
  getRedirectResult(auth)
    .then((result) => {
      if (result && result.user) {
        console.log("[Auth] Sign-in redirect successful:", result.user.displayName);
        showToast(`Signed in as ${result.user.displayName}`);
      }
    })
    .catch((error) => {
      console.error("[Auth] Redirect sign-in error", error);
      showToast("Google Sign-in failed. Please try again.", "error");
    });

  // Set up Firebase Auth listener (primarily for Students)
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // If we are logged in as a student, load profile
      if (!state.sessionUser) {
        state.currentUser = user;
        state.userRole = 'student';
        await checkStudentProfile(user);
      }
    } else {
      // If student was logged out
      if (state.userRole === 'student') {
        handleLogout();
      }
    }
  });

  // Re-render Lucide Icons
  lucide.createIcons();
}

// ================= SYSTEM ROUTING =================
function routeToView(viewName) {
  state.currentView = viewName;
  
  // Hide all sections
  el.viewAuth.style.display = 'none';
  el.viewStudent.style.display = 'none';
  el.viewTeacher.style.display = 'none';
  el.viewAdmin.style.display = 'none';
  
  // Show target section
  if (viewName === 'auth') {
    el.viewAuth.style.display = 'flex';
  } else if (viewName === 'student') {
    el.viewStudent.style.display = 'block';
  } else if (viewName === 'teacher') {
    el.viewTeacher.style.display = 'block';
  } else if (viewName === 'admin') {
    el.viewAdmin.style.display = 'block';
  }

  // Clear QR generator intervals if leaving student view
  if (viewName !== 'student') {
    stopQrGenerator();
    stopStudentJoinScanner();
    stopStudentAttendanceScanner();
    if (el.modalFullscreenQr) {
      toggleModal(el.modalFullscreenQr, false);
    }
    if (el.modalStudentJoinScanner) {
      toggleModal(el.modalStudentJoinScanner, false);
    }
    if (el.modalStudentAttendanceScanner) {
      toggleModal(el.modalStudentAttendanceScanner, false);
    }
  }

  // Clear scanner if leaving teacher view
  if (viewName !== 'teacher') {
    stopScanner();
    stopTeacherJoinQrGenerator();
    stopTeacherAttendanceQrGenerator();
    if (el.modalTeacherJoinQr) {
      toggleModal(el.modalTeacherJoinQr, false);
    }
    if (el.modalTeacherAttendanceQr) {
      toggleModal(el.modalTeacherAttendanceQr, false);
    }
  }

  lucide.createIcons();
}

// ================= EVENT LISTENERS =================
function setupEventListeners() {
  
  // Auth view role tabs selector
  el.roleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      el.roleTabs.forEach(t => t.classList.remove('active'));
      el.authForms.forEach(f => f.classList.remove('active'));
      
      tab.classList.add('active');
      const targetRole = tab.getAttribute('data-role');
      document.getElementById(`form-${targetRole}`).classList.add('active');
    });
  });

  // Student Google Login
  el.btnGoogleSignin.addEventListener('click', handleGoogleSignin);

  // Teacher Login
  el.btnTeacherLogin.addEventListener('click', handleTeacherLogin);

  // Admin Login
  el.btnAdminLogin.addEventListener('click', handleAdminLogin);

  // Logouts
  el.btnStudentLogout.addEventListener('click', handleLogout);
  el.btnTeacherLogout.addEventListener('click', handleLogout);
  el.btnAdminLogout.addEventListener('click', handleLogout);

  // Close Modals
  el.btnCloseDayModal.addEventListener('click', () => toggleModal(el.modalDayDetails, false));
  el.btnCloseTeacherPwdModal.addEventListener('click', () => toggleModal(el.modalChangeTeacherPassword, false));

  // Student QR Close button
  el.btnCloseQr.addEventListener('click', () => {
    // Clean up security token in RTDB
    if (state.studentProfile && state.studentProfile.uid) {
      remove(ref(db, `security_tokens/${state.studentProfile.uid}`));
    }
    toggleModal(el.modalFullscreenQr, false);
    el.studentQrCard.style.display = 'none';
    state.activeStudentSubject = null;
    stopQrGenerator();
    // Unselect subjects list items
    document.querySelectorAll('.subject-item').forEach(item => item.classList.remove('active'));
  });

  // Toggle fullscreen on QR container click (opens top-level viewport modal)
  el.studentQrContainer.addEventListener('click', () => {
    toggleModal(el.modalFullscreenQr, true);
  });

  // Close fullscreen on clicking anywhere inside the fullscreen modal
  el.modalFullscreenQr.addEventListener('click', () => {
    toggleModal(el.modalFullscreenQr, false);
  });

  // Student Calendar Navigation
  el.studentCalPrev.addEventListener('click', () => {
    navigateCalendar(-1, 'student');
  });
  el.studentCalNext.addEventListener('click', () => {
    navigateCalendar(1, 'student');
  });
  el.studentCalToday.addEventListener('click', () => {
    resetCalendar('student');
  });

  // Teacher Calendar Navigation
  el.teacherCalPrev.addEventListener('click', () => {
    navigateCalendar(-1, 'teacher');
  });
  el.teacherCalNext.addEventListener('click', () => {
    navigateCalendar(1, 'teacher');
  });
  el.teacherCalToday.addEventListener('click', () => {
    resetCalendar('teacher');
  });

  // Teacher Subject Selector change
  el.teacherActiveSubject.addEventListener('click', handleTeacherSubjectChange);
  el.teacherActiveSubject.addEventListener('change', handleTeacherSubjectChange);

  // Teacher Camera Toggle
  el.btnToggleCamera.addEventListener('click', toggleTeacherCamera);

  // Teacher Export Attendance
  el.btnExportAttendance.addEventListener('click', exportAttendanceCSV);

  // Admin Tab Navigation
  el.adminTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      el.adminTabs.forEach(t => t.classList.remove('active'));
      el.adminPanels.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const targetTabId = tab.getAttribute('data-tab');
      document.getElementById(targetTabId).classList.add('active');
    });
  });

  // Admin Forms
  el.addTeacherForm.addEventListener('submit', handleAddTeacher);
  el.addSubjectForm.addEventListener('submit', handleAddSubject);
  el.adminPasswordForm.addEventListener('submit', handleChangeAdminPassword);
  el.teacherPwdChangeForm.addEventListener('submit', handleSaveTeacherPassword);
  el.studentRegistrationForm.addEventListener('submit', handleSaveStudentProfile);

  // Admin Student Management Modals & Forms
  if (el.addStudentForm) el.addStudentForm.addEventListener('submit', handleAddStudentAdmin);
  if (el.editStudentForm) el.editStudentForm.addEventListener('submit', handleEditStudentAdmin);
  if (el.assignSubjectsForm) el.assignSubjectsForm.addEventListener('submit', handleAssignSubjectsAdmin);
  if (el.deleteStudentForm) el.deleteStudentForm.addEventListener('submit', handleConfirmDeleteStudentAdmin);
  if (el.resetStudentPasswordForm) el.resetStudentPasswordForm.addEventListener('submit', handleResetStudentPasswordAdmin);

  if (el.btnCloseEditStudentModal) el.btnCloseEditStudentModal.addEventListener('click', () => toggleModal(el.modalEditStudent, false));
  if (el.btnCloseAssignSubjectsModal) el.btnCloseAssignSubjectsModal.addEventListener('click', () => toggleModal(el.modalAssignSubjects, false));
  if (el.btnCloseDeleteStudentModal) el.btnCloseDeleteStudentModal.addEventListener('click', () => toggleModal(el.modalDeleteStudentConfirm, false));
  if (el.btnCancelDeleteStudent) el.btnCancelDeleteStudent.addEventListener('click', () => toggleModal(el.modalDeleteStudentConfirm, false));
  if (el.btnCloseResetStudentPassword) el.btnCloseResetStudentPassword.addEventListener('click', () => toggleModal(el.modalResetStudentPassword, false));

  // Teacher & Student Subject Joining
  if (el.btnTeacherJoinQr) {
    el.btnTeacherJoinQr.addEventListener('click', openTeacherJoinQrModal);
  }
  if (el.btnCloseTeacherJoinQr) {
    el.btnCloseTeacherJoinQr.addEventListener('click', closeTeacherJoinQrModal);
  }
  if (el.teacherJoinQrSelect) {
    el.teacherJoinQrSelect.addEventListener('change', (e) => handleTeacherJoinQrSubjectChange(e.target.value));
  }
  if (el.btnStudentJoinScan) {
    el.btnStudentJoinScan.addEventListener('click', openStudentJoinScanner);
  }
  if (el.btnCloseStudentJoinScanner) {
    el.btnCloseStudentJoinScanner.addEventListener('click', closeStudentJoinScanner);
  }

  // Teacher Attendance QR (Teacher generates → students scan)
  if (el.btnTeacherAttendanceQr) {
    el.btnTeacherAttendanceQr.addEventListener('click', openTeacherAttendanceQrModal);
  }
  if (el.btnCloseTeacherAttendanceQr) {
    el.btnCloseTeacherAttendanceQr.addEventListener('click', closeTeacherAttendanceQrModal);
  }
  if (el.teacherAttendanceQrSelect) {
    el.teacherAttendanceQrSelect.addEventListener('change', (e) => handleTeacherAttendanceQrSubjectChange(e.target.value));
  }

  // Student Attendance Scanner (Student scans teacher's Attendance QR)
  if (el.btnStudentScanAttendance) {
    el.btnStudentScanAttendance.addEventListener('click', openStudentAttendanceScanner);
  }
  if (el.btnCloseStudentAttendanceScanner) {
    el.btnCloseStudentAttendanceScanner.addEventListener('click', closeStudentAttendanceScanner);
  }
}

// ================= CAMERA ZOOM ENGINE =================
/**
 * Sets up hardware optical zoom (Android) with CSS digital zoom fallback (iOS).
 * Reveals the zoom slider after the camera stream is ready.
 *
 * @param {string} readerId   - ID of the qr-reader div (contains the <video>)
 * @param {string} sliderId   - ID of the <input type="range"> zoom slider
 * @param {string} labelId    - ID of the zoom level <span>
 * @param {string} rowId      - ID of the zoom control row (shown after ready)
 */
function setupCameraZoom(readerId, sliderId, labelId, rowId) {
  // Wait a tick for html5-qrcode to inject the <video> element
  setTimeout(() => {
    const readerEl  = document.getElementById(readerId);
    const slider    = document.getElementById(sliderId);
    const label     = document.getElementById(labelId);
    const row       = document.getElementById(rowId);

    if (!readerEl || !slider || !label || !row) return;

    const video = readerEl.querySelector('video');
    if (!video) return;

    // Show zoom row
    row.style.display = 'flex';
    lucide.createIcons();

    // Try to get the camera track for hardware zoom
    const stream = video.srcObject;
    let track = null;
    let hwZoomMin = 1, hwZoomMax = 1, hwZoomSupported = false;

    if (stream) {
      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        track = tracks[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.zoom) {
          hwZoomMin = caps.zoom.min || 1;
          hwZoomMax = caps.zoom.max || 5;
          hwZoomSupported = true;
          slider.min   = hwZoomMin;
          slider.max   = hwZoomMax;
          slider.step  = (hwZoomMax - hwZoomMin) / 50;
          slider.value = hwZoomMin;
        }
      }
    }

    // Update slider fill gradient
    function updateSliderFill(val) {
      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      const pct = ((val - min) / (max - min)) * 100;
      slider.style.setProperty('--zoom-pct', pct + '%');
    }

    // Apply zoom: hardware if supported, CSS digital otherwise
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      const displayVal = hwZoomSupported
        ? val.toFixed(1)
        : val.toFixed(1);
      label.textContent = displayVal + '\u00d7';
      updateSliderFill(val);

      if (hwZoomSupported && track) {
        // Hardware optical zoom (Android Chrome, Edge)
        track.applyConstraints({ advanced: [{ zoom: val }] })
          .catch(e => {
            // Fallback to CSS digital zoom if hardware fails
            video.style.transform = `scale(${val})`;
          });
      } else {
        // CSS digital zoom fallback (iOS Safari, unsupported browsers)
        video.style.transform = `scale(${val})`;
      }
    });

    // Init fill at default
    updateSliderFill(parseFloat(slider.value));
  }, 800); // 800ms delay — enough for html5-qrcode to inject video
}

// ================= AUDIO CHIME SYNTHESIZER =================
// Generates professional sound effects locally using the Web Audio API
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Satisfying double-tone checkmark chime (Beep-Boop)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      
      // Secondary higher tone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
      gain2.gain.setValueAtTime(0, ctx.currentTime);
      gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc2.start(ctx.currentTime + 0.08);
      
      osc.stop(ctx.currentTime + 0.3);
      osc2.stop(ctx.currentTime + 0.35);
    } else if (type === 'error') {
      // Low failure buzzer sound
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch (err) {
    console.error("Audio synthesizer context error", err);
  }
}

// ================= TOASTS & MODALS HELPERS =================
function showToast(message, type = 'success') {
  el.toast.innerHTML = '';
  
  let iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  else if (type === 'warning') iconName = 'info';

  el.toast.innerHTML = `<i data-lucide="${iconName}"></i> <span>${message}</span>`;
  el.toast.className = 'toast';
  
  // Style according to type
  if (type === 'error') {
    el.toast.style.borderLeftColor = 'var(--status-error)';
  } else if (type === 'warning') {
    el.toast.style.borderLeftColor = 'var(--status-warning)';
  } else {
    el.toast.style.borderLeftColor = 'var(--status-success)';
  }

  el.toast.classList.add('active');
  lucide.createIcons();

  setTimeout(() => {
    el.toast.classList.remove('active');
  }, 3500);
}

function toggleModal(modalEl, show) {
  if (show) {
    modalEl.classList.add('active');
  } else {
    modalEl.classList.remove('active');
  }
}

// ================= AUTHENTICATION HANDLERS =================

// --- Student Google Auth ---
async function handleGoogleSignin() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  try {
    if (isMobile) {
      console.log("[Auth] Mobile device detected, initiating Google Sign-In Redirect...");
      await signInWithRedirect(auth, googleProvider);
    } else {
      console.log("[Auth] Desktop device detected, initiating Google Sign-In Popup...");
      const result = await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged will handle profile checks and routing
      showToast(`Signed in as ${result.user.displayName}`);
    }
  } catch (error) {
    console.error("Google Sign-In failed", error);
    showToast("Google Sign-in failed. Please try again.", "error");
  }
}

// Check if student profile exists in Realtime Database, otherwise trigger registration modal
async function checkStudentProfile(user) {
  try {
    const snapshot = await get(ref(db, `students/${user.uid}`));
    if (snapshot.exists()) {
      state.studentProfile = snapshot.val();
      localStorage.setItem('auraattend_session', JSON.stringify({
        role: 'student',
        user: state.studentProfile
      }));
      routeToView('student');
      initStudentDashboard();
    } else {
      // First-time login: complete profile setup
      el.studentRegistrationForm.reset();
      // Auto-populate names from Google account where possible
      if (user.displayName) {
        const names = user.displayName.split(" ");
        document.getElementById('reg-first-name').value = names[0] || '';
        document.getElementById('reg-last-name').value = names[names.length - 1] || '';
      }
      toggleModal(el.modalStudentRegistration, true);
    }
  } catch (error) {
    console.error("Database read failed", error);
    showToast("Database connection error. Reverting to login.", "error");
    signOut(auth);
  }
}

// Save first-time student registration details to RTDB
async function handleSaveStudentProfile() {
  const firstName = document.getElementById('reg-first-name').value.trim();
  const lastName = document.getElementById('reg-last-name').value.trim();
  const middleName = document.getElementById('reg-middle-name').value.trim() || "";
  const studentIdNo = document.getElementById('reg-student-id').value.trim() || "N/A";

  if (!firstName || !lastName) {
    showToast("First Name and Last Name are required.", "error");
    return;
  }

  const profileData = {
    uid: state.currentUser.uid,
    email: state.currentUser.email,
    firstName: firstName,
    lastName: lastName,
    middleName: middleName,
    studentIdNumber: studentIdNo,
    photoURL: state.currentUser.photoURL || "",
    registeredAt: serverTimestamp()
  };

  try {
    await set(ref(db, `students/${state.currentUser.uid}`), profileData);
    state.studentProfile = profileData;

    localStorage.setItem('auraattend_session', JSON.stringify({
      role: 'student',
      user: state.studentProfile
    }));
    
    toggleModal(el.modalStudentRegistration, false);
    showToast("Registration completed successfully!");
    
    routeToView('student');
    initStudentDashboard();
  } catch (error) {
    console.error("Failed to save student profile", error);
    showToast("Failed to save registration. Try again.", "error");
  }
}

// --- Teacher Database Auth ---
async function handleTeacherLogin() {
  const email = el.teacherEmail.value.trim();
  const password = el.teacherPassword.value;

  if (!email || !password) {
    showToast("Please enter email and password.", "error");
    return;
  }

  // Visual loading feedback
  el.btnTeacherLogin.disabled = true;
  el.btnTeacherLogin.textContent = "Verifying...";

  try {
    // Security query: only retrieve the specific teacher record by email index
    const teacherQuery = query(ref(db, 'teachers'), orderByChild('email'), equalTo(email.toLowerCase()));
    const snapshot = await get(teacherQuery);

    if (snapshot.exists()) {
      let loggedInTeacher = null;
      snapshot.forEach((childSnap) => {
        loggedInTeacher = childSnap.val();
      });

      if (loggedInTeacher) {
        const uid = loggedInTeacher.uid;
        let isAuthorized = false;

        // Retrieve salted password credentials securely from private node
        const credRef = ref(db, `teacher_credentials/${uid}`);
        const credSnapshot = await get(credRef);

        if (credSnapshot.exists()) {
          const creds = credSnapshot.val();
          const calculatedHash = await hashPassword(password, creds.salt);
          if (calculatedHash === creds.passwordHash) {
            isAuthorized = true;
          }
        } else if (loggedInTeacher.password && loggedInTeacher.password === password) {
          // Backward-compatible migration: auto-migrate plaintext credentials on first login
          isAuthorized = true;
          const salt = generateSalt();
          const hash = await hashPassword(password, salt);
          
          // Store secure credentials and purge plaintext records
          await set(ref(db, `teacher_credentials/${uid}`), {
            passwordHash: hash,
            salt: salt
          });
          await update(ref(db, `teachers/${uid}`), {
            password: null
          });
          delete loggedInTeacher.password;
        }

        if (isAuthorized) {
          // Never keep credentials in memory or profile states
          delete loggedInTeacher.password;
          
          state.sessionUser = loggedInTeacher;
          state.teacherProfile = loggedInTeacher;
          state.userRole = 'teacher';
          
          // Persist session safely WITHOUT any credentials
          localStorage.setItem('auraattend_session', JSON.stringify({
            role: 'teacher',
            user: loggedInTeacher
          }));

          showToast(`Logged in successfully as ${loggedInTeacher.name}`);
          routeToView('teacher');
          initTeacherDashboard();
        } else {
          showToast("Invalid teacher email or password.", "error");
        }
      } else {
        showToast("Invalid teacher email or password.", "error");
      }
    } else {
      showToast("No teacher account found.", "error");
    }
  } catch (error) {
    console.error("Teacher authentication failed", error);
    showToast("Authentication connection error.", "error");
  } finally {
    el.btnTeacherLogin.disabled = false;
    el.btnTeacherLogin.textContent = "Sign In";
  }
}

// --- Admin Database Auth ---
async function handleAdminLogin() {
  const email = el.adminEmail.value.trim();
  const password = el.adminPassword.value;

  if (!email || !password) {
    showToast("Please enter email and password.", "error");
    return;
  }

  el.btnAdminLogin.disabled = true;
  el.btnAdminLogin.textContent = "Verifying...";

  try {
    if (email.toLowerCase() !== "admin@system.com") {
      showToast("Invalid admin email or password.", "error");
      return;
    }

    let isAuthorized = false;

    // Check secure admin_credentials credentials node
    const credRef = ref(db, 'admin_credentials');
    const snapshot = await get(credRef);

    if (snapshot.exists()) {
      const creds = snapshot.val();
      const calculatedHash = await hashPassword(password, creds.salt);
      if (calculatedHash === creds.passwordHash) {
        isAuthorized = true;
      }
    } else {
      // Legacy check and auto-migration fallback
      const legacyRef = ref(db, 'settings/adminPassword');
      const legacySnapshot = await get(legacyRef);
      const correctLegacyPassword = legacySnapshot.exists() ? legacySnapshot.val() : "admin123";

      if (password === correctLegacyPassword) {
        isAuthorized = true;
        
        // Migrate to secure hashed structure
        const salt = generateSalt();
        const hash = await hashPassword(password, salt);
        await set(ref(db, 'admin_credentials'), {
          passwordHash: hash,
          salt: salt
        });
        
        // Clean up unhashed node
        await remove(legacyRef);
      }
    }

    if (isAuthorized) {
      const adminUser = { email: "admin@system.com", name: "Administrator" };
      state.sessionUser = adminUser;
      state.userRole = 'admin';

      localStorage.setItem('auraattend_session', JSON.stringify({
        role: 'admin',
        user: adminUser
      }));

      showToast("Logged in as System Administrator!");
      routeToView('admin');
      initAdminDashboard();
    } else {
      showToast("Invalid admin email or password.", "error");
    }
  } catch (error) {
    console.error("Admin authentication failed", error);
    showToast("Database error during admin login.", "error");
  } finally {
    el.btnAdminLogin.disabled = false;
    el.btnAdminLogin.textContent = "Sign In";
  }
}

// --- Global Sign-out ---
async function handleLogout() {
  // Clear any existing database listeners
  state.dbListeners.forEach(unsubscribe => unsubscribe());
  state.dbListeners = [];

  // Stop camera if teacher was scanning
  stopScanner();

  if (state.userRole === 'student') {
    try {
      // Clean up security token in RTDB on logout
      if (state.studentProfile && state.studentProfile.uid) {
        await remove(ref(db, `security_tokens/${state.studentProfile.uid}`));
      }
      await signOut(auth);
    } catch (error) {
      console.error("Firebase Sign-out failed", error);
    }
  }
  
  // Clean caches on logout to avoid session leaks
  localStorage.removeItem('auraattend_cache_subjects');
  localStorage.removeItem('auraattend_cache_attendance');
  localStorage.removeItem('auraattend_cache_subjectEnrollments');
  localStorage.removeItem('auraattend_cache_admin_teachers');
  localStorage.removeItem('auraattend_cache_admin_students');

  // Reset state
  state.currentUser = null;
  state.sessionUser = null;
  state.userRole = null;
  state.studentProfile = null;
  state.teacherProfile = null;
  localStorage.removeItem('auraattend_session');

  routeToView('auth');
  showToast("Logged out successfully.");
}

// ================= STUDENT DASHBOARD LOGIC =================
function initStudentDashboard() {
  // Populate student details header
  el.studentAvatar.src = state.studentProfile.photoURL || "https://img.icons8.com/color/96/user.png";
  el.studentNameDisplay.textContent = `${state.studentProfile.firstName} ${state.studentProfile.lastName}`;
  el.studentIdDisplay.textContent = `ID: ${state.studentProfile.studentIdNumber || 'N/A'}`;

  // Load cache first for instant layout rendering
  loadStudentCachedData();

  resetCalendar('student');

  // Set up real-time listener for subjects and attendance logs
  setupStudentRealTimeData();
}

function loadStudentCachedData() {
  try {
    const cachedSubjects = localStorage.getItem('auraattend_cache_subjects');
    const cachedAttendance = localStorage.getItem('auraattend_cache_attendance');
    const cachedEnrollments = localStorage.getItem('auraattend_cache_subjectEnrollments');

    if (cachedSubjects) state.subjects = JSON.parse(cachedSubjects);
    if (cachedAttendance) state.attendance = JSON.parse(cachedAttendance);
    if (cachedEnrollments) state.subjectEnrollments = JSON.parse(cachedEnrollments);

    if (cachedSubjects || cachedAttendance || cachedEnrollments) {
      renderStudentSubjectList();
      calculateStudentStats();
      renderCalendar('student');
    }
  } catch (err) {
    console.warn("Failed to load cached data for student", err);
  }
}

function setupStudentRealTimeData() {
  // Clear existing listeners
  state.dbListeners.forEach(unsub => unsub());
  state.dbListeners = [];

  // 1. Listen to all subjects to populate the subject navigation list
  const subjectsRef = ref(db, 'subjects');
  const unsubSubjects = onValue(subjectsRef, (snapshot) => {
    state.subjects = {};
    if (snapshot.exists()) {
      state.subjects = snapshot.val();
      localStorage.setItem('auraattend_cache_subjects', JSON.stringify(state.subjects));
    }
    renderStudentSubjectList();
    renderCalendar('student');
  });
  state.dbListeners.push(unsubSubjects);

  // 2. Listen to all attendance logs to map to calendars
  const attendanceRef = ref(db, 'attendance');
  const unsubAttendance = onValue(attendanceRef, (snapshot) => {
    state.attendance = {};
    if (snapshot.exists()) {
      state.attendance = snapshot.val();
      localStorage.setItem('auraattend_cache_attendance', JSON.stringify(state.attendance));
    }
    calculateStudentStats();
    renderCalendar('student');
  });
  state.dbListeners.push(unsubAttendance);

  // 3. Listen to subject enrollments to filter student subject list
  const enrollmentsRef = ref(db, 'subject_enrollments');
  const unsubEnrollments = onValue(enrollmentsRef, (snapshot) => {
    state.subjectEnrollments = {};
    if (snapshot.exists()) {
      state.subjectEnrollments = snapshot.val();
      localStorage.setItem('auraattend_cache_subjectEnrollments', JSON.stringify(state.subjectEnrollments));
    }
    renderStudentSubjectList();
    renderCalendar('student');
    calculateStudentStats();
  });
  state.dbListeners.push(unsubEnrollments);
}

// Populate student sidebar subjects list
function renderStudentSubjectList() {
  el.studentSubjectList.innerHTML = '';
  
  const subjectsArray = Object.values(state.subjects);
  const studentUid = state.studentProfile ? state.studentProfile.uid : null;

  // Filter subjects where the student is enrolled
  const enrolledSubjects = subjectsArray.filter(subject => {
    return studentUid && 
           state.subjectEnrollments && 
           state.subjectEnrollments[subject.id] && 
           state.subjectEnrollments[subject.id][studentUid];
  });
  
  if (enrolledSubjects.length === 0) {
    el.studentSubjectList.innerHTML = '<div class="empty-state">You haven\'t joined any subjects. Click "Scan to Join Subject" below!</div>';
    return;
  }

  enrolledSubjects.forEach((subject) => {
    const subjectItem = document.createElement('div');
    subjectItem.className = `subject-item ${state.activeStudentSubject === subject.id ? 'active' : ''}`;
    subjectItem.innerHTML = `
      <span class="subj-code">${subject.code}</span>
      <span class="subj-name">${subject.name}</span>
      <div class="subj-meta">
        <span><i data-lucide="clock" style="width: 11px; height: 11px; display: inline; vertical-align: middle; margin-right: 2px;"></i> ${subject.timeStart} - ${subject.timeEnd}</span>
        <span>${subject.room}</span>
      </div>
    `;

    subjectItem.addEventListener('click', () => {
      document.querySelectorAll('.subject-item').forEach(item => item.classList.remove('active'));
      subjectItem.classList.add('active');
      selectStudentSubject(subject.id);
    });

    el.studentSubjectList.appendChild(subjectItem);
  });
  
  lucide.createIcons();
}

function selectStudentSubject(subjectId) {
  state.activeStudentSubject = subjectId;
  const subject = state.subjects[subjectId];
  if (!subject) return;

  // Show QR Card
  el.qrSubjectTitle.textContent = `${subject.code} - QR Code`;
  el.qrDetailRoom.textContent = subject.room;
  el.qrDetailId.textContent = state.studentProfile.studentIdNumber || 'N/A';
  el.qrDetailName.textContent = `${state.studentProfile.firstName} ${state.studentProfile.lastName}`;
  
  // Initialize with normal mode (not fullscreen)
  toggleModal(el.modalFullscreenQr, false);
  el.studentQrCard.style.display = 'block';

  // Trigger QR Code generation
  generateSecureQR();
  startQrGenerator();
}

// Generate the QR Code payload with auto-refresh timestamp token and database verification
async function generateSecureQR() {
  const subject = state.subjects[state.activeStudentSubject];
  if (!subject) return;

  const now = getSyncedDate();
  const dateStr = getFormattedDateString(now);
  el.qrDetailDate.textContent = dateStr;

  // Generate a random 6-character One-Time Password (OTP)
  const otp = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Write the OTP to the Realtime Database under security_tokens
  try {
    const tokenRef = ref(db, `security_tokens/${state.studentProfile.uid}`);
    await set(tokenRef, {
      otp: otp,
      timestamp: serverTimestamp(),
      subjectId: subject.id
    });
  } catch (err) {
    console.error("Failed to write security token", err);
  }

  // Formulate a compact secure payload containing only essential references
  const payloadObj = {
    u: state.studentProfile.uid,
    s: subject.id,
    t: now.getTime(),
    o: otp
  };

  const payloadString = JSON.stringify(payloadObj);

  // Draw the QR Code using QRious
  if (typeof QRious !== 'undefined') {
    new QRious({
      element: el.studentQrCanvas,
      value: payloadString,
      size: 350,
      background: '#ffffff',
      foreground: '#0b0f19',
      level: 'M'
    });

    // Draw on the top-level fullscreen modal canvas too
    new QRious({
      element: el.fullscreenQrCanvas,
      value: payloadString,
      size: 600,
      background: '#ffffff',
      foreground: '#0b0f19',
      level: 'M'
    });
  } else {
    console.error("QRious library not loaded.");
  }
}

function startQrGenerator() {
  stopQrGenerator();
  
  state.qrTimeRemaining = 10;
  el.qrTimerText.textContent = `${state.qrTimeRemaining}s`;
  if (el.fullscreenQrTimerText) {
    el.fullscreenQrTimerText.textContent = `${state.qrTimeRemaining}s`;
  }

  state.qrInterval = setInterval(() => {
    state.qrTimeRemaining--;
    
    if (state.qrTimeRemaining <= 0) {
      state.qrTimeRemaining = 10;
      generateSecureQR(); // Generate a fresh QR code with new timestamp
    }
    
    el.qrTimerText.textContent = `${state.qrTimeRemaining}s`;
    if (el.fullscreenQrTimerText) {
      el.fullscreenQrTimerText.textContent = `${state.qrTimeRemaining}s`;
    }
  }, 1000);
}

function stopQrGenerator() {
  if (state.qrInterval) {
    clearInterval(state.qrInterval);
    state.qrInterval = null;
  }
}

// Compute attendance statistics for student
function calculateStudentStats() {
  let totalPresent = 0;
  let totalAbsent = 0;
  let studentUid = state.studentProfile ? state.studentProfile.uid : null;

  if (!studentUid) return;

  // Only calculate statistics for enrolled subjects
  const enrolledSubjectKeys = Object.keys(state.subjects).filter(subjectId => {
    return state.subjectEnrollments && 
           state.subjectEnrollments[subjectId] && 
           state.subjectEnrollments[subjectId][studentUid];
  });

  if (enrolledSubjectKeys.length === 0) {
    el.studentStatRate.textContent = '0%';
    el.studentStatPresent.textContent = '0';
    el.studentStatAbsent.textContent = '0';
    return;
  }

  // Loop through all attendance logs in DB for enrolled subjects
  enrolledSubjectKeys.forEach(subjectId => {
    const datesNode = state.attendance[subjectId];
    if (datesNode) {
      Object.keys(datesNode).forEach(dateStr => {
        const records = datesNode[dateStr];
        if (records[studentUid]) {
          const record = records[studentUid];
          if (record.status === 'Present') {
            totalPresent++;
          } else if (record.status === 'Absent') {
            totalAbsent++;
          }
        }
      });
    }
  });

  const totalClasses = totalPresent + totalAbsent;
  const attendanceRate = totalClasses > 0 ? Math.round((totalPresent / totalClasses) * 100) : 100;

  el.studentStatPresent.textContent = totalPresent;
  el.studentStatAbsent.textContent = totalAbsent;
  el.studentStatRate.textContent = `${attendanceRate}%`;
}

// ================= TEACHER DASHBOARD LOGIC =================
function initTeacherDashboard() {
  el.teacherNameDisplay.textContent = state.teacherProfile.name;
  el.teacherEmailDisplay.textContent = state.teacherProfile.email;

  // Load cached database records first for instant display
  loadTeacherCachedData();

  resetCalendar('teacher');

  // Load teacher active subjects list in dropdown
  setupTeacherRealTimeData();
}

function loadTeacherCachedData() {
  try {
    const cachedSubjects = localStorage.getItem('auraattend_cache_subjects');
    const cachedAttendance = localStorage.getItem('auraattend_cache_attendance');

    if (cachedSubjects) state.subjects = JSON.parse(cachedSubjects);
    if (cachedAttendance) state.attendance = JSON.parse(cachedAttendance);

    if (cachedSubjects || cachedAttendance) {
      populateTeacherSubjectsDropdown();
      renderCalendar('teacher');
      renderTeacherAttendeeList();
    }
  } catch (err) {
    console.warn("Failed to load cached data for teacher", err);
  }
}

function setupTeacherRealTimeData() {
  state.dbListeners.forEach(unsub => unsub());
  state.dbListeners = [];

  // 1. Listen to all subjects to populate the active subject dropdown
  const subjectsRef = ref(db, 'subjects');
  const unsubSubjects = onValue(subjectsRef, (snapshot) => {
    state.subjects = {};
    if (snapshot.exists()) {
      state.subjects = snapshot.val();
      localStorage.setItem('auraattend_cache_subjects', JSON.stringify(state.subjects));
    }
    populateTeacherSubjectsDropdown();
    renderCalendar('teacher');
  });
  state.dbListeners.push(unsubSubjects);
  
  // 2. Listen to all attendance logs
  const attendanceRef = ref(db, 'attendance');
  const unsubAttendance = onValue(attendanceRef, (snapshot) => {
    state.attendance = {};
    if (snapshot.exists()) {
      state.attendance = snapshot.val();
      localStorage.setItem('auraattend_cache_attendance', JSON.stringify(state.attendance));
    }
    renderCalendar('teacher');
    renderTeacherAttendeeList();
  });
  state.dbListeners.push(unsubAttendance);
}

function populateTeacherSubjectsDropdown() {
  const activeSubjectSelect = el.teacherActiveSubject;
  
  // Preserve current selected value if still valid
  const currentSelected = activeSubjectSelect.value;
  
  activeSubjectSelect.innerHTML = '<option value="">-- Choose Subject --</option>';

  Object.values(state.subjects).forEach(subject => {
    // Only display subjects belonging to this teacher
    if (subject.teacherId === state.teacherProfile.uid) {
      const option = document.createElement('option');
      option.value = subject.id;
      option.textContent = `${subject.code} - ${subject.name}`;
      activeSubjectSelect.appendChild(option);
    }
  });

  if (currentSelected && activeSubjectSelect.querySelector(`option[value="${currentSelected}"]`)) {
    activeSubjectSelect.value = currentSelected;
  } else {
    state.activeTeacherSubject = null;
    el.teacherSessionInfo.style.display = 'none';
    el.btnToggleCamera.disabled = true;
  }
}

function handleTeacherSubjectChange() {
  const selectedSubjectId = el.teacherActiveSubject.value;
  state.activeTeacherSubject = selectedSubjectId;

  if (!selectedSubjectId) {
    el.teacherSessionInfo.style.display = 'none';
    el.btnToggleCamera.disabled = true;
    stopScanner();
    renderTeacherAttendeeList();
    return;
  }

  const subject = state.subjects[selectedSubjectId];
  if (subject) {
    el.sessionInfoTime.textContent = `${subject.timeStart} - ${subject.timeEnd}`;
    el.sessionInfoRoom.textContent = subject.room;
    el.sessionInfoDay.textContent = subject.scheduledDays ? subject.scheduledDays.join(', ') : subject.day;
    el.teacherSessionInfo.style.display = 'block';
    el.btnToggleCamera.disabled = false;
    
    // Set current date
    const now = new Date();
    el.currentSessionDate.textContent = getFormattedDateString(now);

    renderTeacherAttendeeList();
  }
}

// Render the real-time checklist of students marked present today
function renderTeacherAttendeeList() {
  el.teacherAttendeeList.innerHTML = '';
  
  if (!state.activeTeacherSubject) {
    el.teacherAttendeeList.innerHTML = '<div class="empty-state">Select an active subject above to load attendance logs.</div>';
    el.attendeeCount.textContent = '0';
    return;
  }

  const todayStr = getFormattedDateString(new Date());
  
  const subjectAttendance = state.attendance[state.activeTeacherSubject];
  if (!subjectAttendance || !subjectAttendance[todayStr]) {
    el.teacherAttendeeList.innerHTML = '<div class="empty-state">No students checked in yet.</div>';
    el.attendeeCount.textContent = '0';
    return;
  }

  const studentsToday = Object.values(subjectAttendance[todayStr]);
  el.attendeeCount.textContent = studentsToday.length;

  if (studentsToday.length === 0) {
    el.teacherAttendeeList.innerHTML = '<div class="empty-state">No students checked in yet.</div>';
    return;
  }

  // Sort by scan time descending
  studentsToday.sort((a, b) => b.timestamp - a.timestamp);

  studentsToday.forEach(record => {
    const timeStr = new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const nameInitials = record.name ? record.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "ST";
    
    const item = document.createElement('div');
    item.className = 'attendee-item';
    item.innerHTML = `
      <div class="attendee-avatar">${nameInitials}</div>
      <div class="attendee-meta">
        <span class="attendee-name">${record.name}</span>
        <span class="attendee-time">ID: ${record.studentIdNumber} • Scan: ${timeStr}</span>
      </div>
      <span class="attendee-badge-rtd">Verified</span>
    `;
    el.teacherAttendeeList.appendChild(item);
  });
}

// Robust camera startup helper with automatic fallback for older devices/laptops
async function startHtml5QrScannerWithFallback(scannerInstance, targetConfig, onSuccess, onFailure) {
  // First attempt: back camera with constraints (e.g. 1080p resolution)
  try {
    await scannerInstance.start({ facingMode: "environment" }, targetConfig, onSuccess, onFailure);
    return;
  } catch (err) {
    console.warn("[Camera] First attempt failed (back camera + constraints). Retrying with back camera only...", err);
  }

  // Second attempt: environment camera with no resolution constraints
  try {
    const fallbackConfig = { ...targetConfig };
    delete fallbackConfig.videoConstraints;
    await scannerInstance.start({ facingMode: "environment" }, fallbackConfig, onSuccess, onFailure);
    return;
  } catch (err) {
    console.warn("[Camera] Second attempt failed (back camera only). Retrying with browser default camera...", err);
  }

  // Third attempt: default browser camera with no constraints
  try {
    const finalConfig = { ...targetConfig };
    delete finalConfig.videoConstraints;
    await scannerInstance.start({}, finalConfig, onSuccess, onFailure);
  } catch (err) {
    console.error("[Camera] All camera initialization attempts failed.", err);
    throw err; // Propagate the error so calling functions show warnings
  }
}

// --- Live QR Code Scanner (html5-qrcode) ---
function toggleTeacherCamera() {
  if (state.isCameraRunning) {
    stopScanner();
  } else {
    startScanner();
  }
}

function startScanner() {
  if (!state.activeTeacherSubject) {
    showToast("Please select an active subject first.", "warning");
    return;
  }

  state.isCameraRunning = true;
  el.btnToggleCamera.innerHTML = '<i data-lucide="camera-off"></i> <span>Stop Camera</span>';
  el.btnToggleCamera.className = 'btn btn-secondary';
  el.scannerLaser.style.display = 'block';
  el.scannerStatusText.textContent = "Camera Streaming...";
  el.scannerStatusText.style.color = "var(--status-success)";
  el.scanFeedbackBox.style.display = 'none';

  lucide.createIcons();

  // Initialize html5-qrcode scanner
  state.html5QrScanner = new Html5Qrcode("qr-reader");
  
  // Dynamic responsive qrbox sizing function
  const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const qrboxSize = Math.floor(minEdge * 0.85);
    return {
      width: qrboxSize,
      height: qrboxSize
    };
  };

  const config = { 
    fps: 25, 
    qrbox: qrboxFunction,
    aspectRatio: 1.0,
    videoConstraints: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  startHtml5QrScannerWithFallback(
    state.html5QrScanner,
    config,
    onQrCodeSuccess,
    onQrCodeFailure
  ).catch(err => {
    console.error("Camera startup failed", err);
    showToast("Failed to open camera. Grant camera permissions.", "error");
    stopScanner();
  });
}

function stopScanner() {
  state.isCameraRunning = false;
  state.isScanThrottled = false; // Reset throttling when camera stops
  el.btnToggleCamera.innerHTML = '<i data-lucide="camera"></i> <span>Start Camera</span>';
  el.btnToggleCamera.className = 'btn btn-secondary';
  el.scannerLaser.style.display = 'none';
  el.scannerStatusText.textContent = "Scanner Stopped";
  el.scannerStatusText.style.color = "var(--text-muted)";
  
  lucide.createIcons();

  if (state.html5QrScanner) {
    state.html5QrScanner.stop().then(() => {
      state.html5QrScanner = null;
    }).catch(err => {
      console.error("Error stopping scanner", err);
      state.html5QrScanner = null;
    });
  }
}

// Callback when QR is successfully read from camera stream
function onQrCodeSuccess(decodedText) {
  if (state.isScanThrottled) return;

  try {
    const qrData = JSON.parse(decodedText);
    
    // Quick validation of shape
    const uid = qrData.u || qrData.uid;
    const subjectId = qrData.s || qrData.subjectId;
    const timestamp = qrData.t || qrData.timestamp;
    const otp = qrData.o || qrData.otp;
    
    if (!uid || !subjectId || !timestamp || !otp) {
      handleScanFeedback(false, "Malformed or insecure QR code.");
      return;
    }

    // Trigger 5-second scanner throttle lock
    state.isScanThrottled = true;
    let countdown = 5;
    el.scannerStatusText.textContent = `Cooldown: Next scan in ${countdown}s...`;
    el.scannerStatusText.style.color = "var(--status-warning)";

    const timerId = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timerId);
        state.isScanThrottled = false;
        if (state.isCameraRunning) {
          el.scannerStatusText.textContent = "Camera Streaming...";
          el.scannerStatusText.style.color = "var(--status-success)";
        }
      } else {
        if (state.isCameraRunning) {
          el.scannerStatusText.textContent = `Cooldown: Next scan in ${countdown}s...`;
        } else {
          clearInterval(timerId);
        }
      }
    }, 1000);

    validateAndRecordAttendance(qrData);
  } catch (error) {
    handleScanFeedback(false, "Invalid QR Code format. Scan failed.");
  }
}

function onQrCodeFailure(error) {
  // Silence verbose scanning noise
}

// Validation logic for attendance scanning with database OTP check (Anti-Cheating)
async function validateAndRecordAttendance(qrData) {
  const currentTeacherId = state.teacherProfile.uid;
  const currentSubjectId = state.activeTeacherSubject;
  const now = getSyncedDate();
  const todayStr = getFormattedDateString(now);

  const uid = qrData.u || qrData.uid;
  const subjectId = qrData.s || qrData.subjectId;
  const timestamp = qrData.t || qrData.timestamp;
  const otp = qrData.o || qrData.otp;

  // 1. Structural Validation
  if (!uid || !subjectId || !timestamp || !otp) {
    handleScanFeedback(false, "Malformed or insecure QR code.");
    return;
  }

  // 2. Subject Match check
  if (subjectId !== currentSubjectId) {
    handleScanFeedback(false, "Subject Mismatch. Code is for another class.");
    return;
  }

  // Optional legacy check for teacherId if present in QR code
  if (qrData.teacherId && qrData.teacherId !== currentTeacherId) {
    handleScanFeedback(false, "Teacher Mismatch. Code is for another class.");
    return;
  }

  // 3. Realtime Database OTP Token Verification
  try {
    const tokenRef = ref(db, `security_tokens/${uid}`);
    const snapshot = await get(tokenRef);
    
    if (!snapshot.exists()) {
      handleScanFeedback(false, "QR Code Expired or already scanned.");
      return;
    }
    
    const tokenData = snapshot.val();
    
    // Verify OTP matches the one written by student in database
    if (tokenData.otp !== otp) {
      handleScanFeedback(false, "Security verification failed. Show live QR code.");
      return;
    }
    
    // Verify subject matches in token
    if (tokenData.subjectId !== currentSubjectId) {
      handleScanFeedback(false, "Security mismatch: token subject mismatch.");
      return;
    }
    
    // Verify token age (must be within 30 seconds of teacher scan time)
    const tokenTime = new Date(tokenData.timestamp);
    const timeDifferenceSeconds = (now.getTime() - tokenTime.getTime()) / 1000;
    if (Math.abs(timeDifferenceSeconds) > 30) {
      handleScanFeedback(false, "QR Code expired. Code is older than 30s.");
      return;
    }

    // 4. Fetch student details dynamically from the database to prevent spoofing
    const studentSnapshot = await get(ref(db, `students/${uid}`));
    if (!studentSnapshot.exists()) {
      handleScanFeedback(false, "Student account profile not found.");
      return;
    }
    const studentProfile = studentSnapshot.val();
    const studentName = `${studentProfile.firstName} ${studentProfile.lastName}`;
    const studentIdNo = studentProfile.studentIdNumber || "N/A";
    
    // 5. Record attendance in Realtime Database
    const attendanceRef = ref(db, `attendance/${currentSubjectId}/${todayStr}/${uid}`);
    
    const record = {
      studentId: uid,
      studentIdNumber: studentIdNo,
      name: studentName,
      timestamp: serverTimestamp(),
      status: "Present",
      scannedBy: currentTeacherId
    };

    await set(attendanceRef, record);
    
    // 6. CONSUME THE OTP: Delete token immediately so it can never be scanned again!
    await remove(tokenRef);
    
    handleScanFeedback(true, `Checked In: ${studentName}!`);
  } catch (err) {
    console.error("Attendance verification error", err);
    handleScanFeedback(false, "Security verification error.");
  }
}

function handleScanFeedback(success, message) {
  // Reset feedback box class
  el.scanFeedbackBox.className = 'scan-result-feedback';
  el.scanFeedbackBox.style.display = 'flex';
  
  if (success) {
    playSound('success');
    el.feedbackIcon.setAttribute('data-lucide', 'check-circle');
    el.feedbackIcon.className = 'text-green';
    el.feedbackTitle.textContent = 'Scan Successful';
    el.feedbackDesc.textContent = message;
  } else {
    playSound('error');
    el.scanFeedbackBox.classList.add('error');
    el.feedbackIcon.setAttribute('data-lucide', 'alert-triangle');
    el.feedbackIcon.className = 'text-red';
    el.feedbackTitle.textContent = 'Scan Rejected';
    el.feedbackDesc.textContent = message;
  }
  
  lucide.createIcons();
}

// Export attendance database node as a downloadable CSV sheet
function exportAttendanceCSV() {
  if (!state.activeTeacherSubject) return;

  const subject = state.subjects[state.activeTeacherSubject];
  if (!subject) return;

  const todayStr = getFormattedDateString(new Date());
  const subjectAttendance = state.attendance[state.activeTeacherSubject];
  
  if (!subjectAttendance || !subjectAttendance[todayStr]) {
    showToast("No attendance records today to export.", "warning");
    return;
  }

  const list = Object.values(subjectAttendance[todayStr]);
  
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Student ID Number,Full Name,Scan Time,Status,Scanned By\n";
  
  list.forEach(record => {
    const timeStr = new Date(record.timestamp).toLocaleTimeString();
    csvContent += `"${record.studentIdNumber}","${record.name}","${timeStr}","${record.status}","${record.scannedBy}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Attendance_${subject.code}_${todayStr}.csv`);
  document.body.appendChild(link); // Required for FF
  link.click();
  document.body.removeChild(link);
}

// ================= ADMIN DASHBOARD LOGIC =================
function initAdminDashboard() {
  // Load cached database records first for instant display
  loadAdminCachedData();
  setupAdminRealTimeData();
}

function loadAdminCachedData() {
  try {
    const cachedTeachers = localStorage.getItem('auraattend_cache_admin_teachers');
    const cachedSubjects = localStorage.getItem('auraattend_cache_subjects');
    const cachedStudents = localStorage.getItem('auraattend_cache_admin_students');
    const cachedAttendance = localStorage.getItem('auraattend_cache_attendance');

    if (cachedTeachers) state.teachers = JSON.parse(cachedTeachers);
    if (cachedSubjects) state.subjects = JSON.parse(cachedSubjects);
    if (cachedStudents) state.students = JSON.parse(cachedStudents);
    if (cachedAttendance) state.attendance = JSON.parse(cachedAttendance);

    if (cachedTeachers || cachedSubjects || cachedStudents || cachedAttendance) {
      renderAdminTeachersTable();
      populateSubjectTeacherSelect();
      renderAdminSubjectsTable();
      renderAdminStudentsTable();
      calculateAdminOverviewStats();
    }
  } catch (err) {
    console.warn("Failed to load cached data for admin", err);
  }
}

function setupAdminRealTimeData() {
  state.dbListeners.forEach(unsub => unsub());
  state.dbListeners = [];

  // 1. Listen to teachers list
  const teachersRef = ref(db, 'teachers');
  const unsubTeachers = onValue(teachersRef, (snapshot) => {
    state.teachers = {};
    if (snapshot.exists()) {
      state.teachers = snapshot.val();
      localStorage.setItem('auraattend_cache_admin_teachers', JSON.stringify(state.teachers));
    }
    renderAdminTeachersTable();
    populateSubjectTeacherSelect();
    calculateAdminOverviewStats();
  });
  state.dbListeners.push(unsubTeachers);

  // 2. Listen to subjects list
  const subjectsRef = ref(db, 'subjects');
  const unsubSubjects = onValue(subjectsRef, (snapshot) => {
    state.subjects = {};
    if (snapshot.exists()) {
      state.subjects = snapshot.val();
      localStorage.setItem('auraattend_cache_subjects', JSON.stringify(state.subjects));
    }
    renderAdminSubjectsTable();
    calculateAdminOverviewStats();
  });
  state.dbListeners.push(unsubSubjects);

  // 3. Listen to students list
  const studentsRef = ref(db, 'students');
  const unsubStudents = onValue(studentsRef, (snapshot) => {
    state.students = {};
    if (snapshot.exists()) {
      state.students = snapshot.val();
      localStorage.setItem('auraattend_cache_admin_students', JSON.stringify(state.students));
    }
    renderAdminStudentsTable();
    calculateAdminOverviewStats();
  });
  state.dbListeners.push(unsubStudents);

  // 4. Listen to attendance list
  const attendanceRef = ref(db, 'attendance');
  const unsubAttendance = onValue(attendanceRef, (snapshot) => {
    state.attendance = {};
    if (snapshot.exists()) {
      state.attendance = snapshot.val();
      localStorage.setItem('auraattend_cache_attendance', JSON.stringify(state.attendance));
    }
    calculateAdminOverviewStats();
  });
  state.dbListeners.push(unsubAttendance);
}

function renderAdminTeachersTable() {
  el.adminTeachersTbody.innerHTML = '';
  const list = Object.values(state.teachers);

  if (list.length === 0) {
    el.adminTeachersTbody.innerHTML = '<tr><td colspan="3" class="text-center">No teacher accounts registered.</td></tr>';
    return;
  }

  list.forEach(teacher => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${teacher.name}</strong></td>
      <td>${teacher.email}</td>
      <td>
        <button class="btn-icon" title="Change Password" data-action="password" data-uid="${teacher.uid}">
          <i data-lucide="key-round"></i>
        </button>
        <button class="btn-icon btn-icon-danger" title="Delete Account" data-action="delete" data-uid="${teacher.uid}">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    `;

    // Attach listeners
    tr.querySelector('[data-action="password"]').addEventListener('click', () => {
      openChangeTeacherPasswordModal(teacher.uid, teacher.name);
    });
    
    tr.querySelector('[data-action="delete"]').addEventListener('click', () => {
      handleDeleteTeacher(teacher.uid, teacher.name);
    });

    el.adminTeachersTbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

function populateSubjectTeacherSelect() {
  const select = el.subjectTeacherSelect;
  select.innerHTML = '<option value="">-- Select Teacher --</option>';
  
  Object.values(state.teachers).forEach(teacher => {
    const option = document.createElement('option');
    option.value = teacher.uid;
    option.textContent = teacher.name;
    select.appendChild(option);
  });
}

function renderAdminSubjectsTable() {
  el.adminSubjectsTbody.innerHTML = '';
  const list = Object.values(state.subjects);

  if (list.length === 0) {
    el.adminSubjectsTbody.innerHTML = '<tr><td colspan="6" class="text-center">No subjects configured.</td></tr>';
    return;
  }

  list.forEach(subject => {
    const tr = document.createElement('tr');
    const displayDays = subject.scheduledDays ? subject.scheduledDays.join(', ') : subject.day;
    tr.innerHTML = `
      <td><strong>${subject.code}</strong></td>
      <td>${subject.name}</td>
      <td>${subject.teacherName}</td>
      <td>${displayDays} • ${subject.timeStart}-${subject.timeEnd}</td>
      <td>${subject.room}</td>
      <td>
        <button class="btn-icon btn-icon-danger" title="Delete Subject" data-action="delete" data-id="${subject.id}">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    `;

    tr.querySelector('[data-action="delete"]').addEventListener('click', () => {
      handleDeleteSubject(subject.id, subject.name);
    });

    el.adminSubjectsTbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

function calculateAdminOverviewStats() {
  el.adminStatStudents.textContent = Object.keys(state.students).length;
  el.adminStatTeachers.textContent = Object.keys(state.teachers).length;
  el.adminStatSubjects.textContent = Object.keys(state.subjects).length;
  
  let recordsCount = 0;
  Object.keys(state.attendance).forEach(subjId => {
    const dates = state.attendance[subjId];
    Object.keys(dates).forEach(date => {
      recordsCount += Object.keys(dates[date]).length;
    });
  });
  el.adminStatRecords.textContent = recordsCount;
}

// Admin Add Teacher Handler
async function handleAddTeacher(e) {
  if (e && e.preventDefault) e.preventDefault();
  const name = document.getElementById('new-teacher-name').value.trim();
  const email = document.getElementById('new-teacher-email').value.trim();
  const password = document.getElementById('new-teacher-password').value;

  if (!name || !email || !password) {
    showToast("All fields are required to add a teacher.", "error");
    return;
  }

  // Generate unique UID
  const teacherRef = push(ref(db, 'teachers'));
  const teacherUid = teacherRef.key;

  // Salt and hash the password
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);

  const teacherProfileData = {
    uid: teacherUid,
    name: name,
    email: email,
    createdAt: serverTimestamp()
  };

  try {
    // Write public details to teacher profile
    await set(ref(db, `teachers/${teacherUid}`), teacherProfileData);
    
    // Write private credentials separately
    await set(ref(db, `teacher_credentials/${teacherUid}`), {
      passwordHash: hash,
      salt: salt
    });

    el.addTeacherForm.reset();
    showToast(`Teacher ${name} added successfully!`);
  } catch (error) {
    console.error("Failed to add teacher", error);
    showToast("Failed to create teacher account.", "error");
  }
}

// Admin Delete Teacher
async function handleDeleteTeacher(uid, name) {
  if (!confirm(`Are you sure you want to delete professor ${name}? All their assigned subjects will remain but they will lose account access.`)) {
    return;
  }

  try {
    await remove(ref(db, `teachers/${uid}`));
    await remove(ref(db, `teacher_credentials/${uid}`));
    showToast(`Deleted teacher account: ${name}`);
  } catch (error) {
    console.error("Failed to delete teacher", error);
    showToast("Database deletion failed.", "error");
  }
}

// Admin Open Password Modal
function openChangeTeacherPasswordModal(uid, name) {
  el.pwdModalTeacherId.value = uid;
  el.pwdModalTeacherName.textContent = name;
  document.getElementById('pwd-modal-new-password').value = '';
  toggleModal(el.modalChangeTeacherPassword, true);
}

// Admin Save Teacher Password
async function handleSaveTeacherPassword(e) {
  if (e && e.preventDefault) e.preventDefault();
  const uid = el.pwdModalTeacherId.value;
  const newPassword = document.getElementById('pwd-modal-new-password').value;

  if (!newPassword || newPassword.length < 6) {
    showToast("Password must be at least 6 characters.", "error");
    return;
  }

  try {
    const salt = generateSalt();
    const hash = await hashPassword(newPassword, salt);

    // Save hashed credentials privately
    await set(ref(db, `teacher_credentials/${uid}`), {
      passwordHash: hash,
      salt: salt
    });

    // Cleanup legacy plaintext password from profile if it exists
    await update(ref(db, `teachers/${uid}`), { password: null });

    toggleModal(el.modalChangeTeacherPassword, false);
    showToast("Teacher password updated successfully!");
  } catch (error) {
    console.error("Failed to update teacher password", error);
    showToast("Failed to change password in database.", "error");
  }
}

// Admin Add Subject
async function handleAddSubject() {
  const code = document.getElementById('subject-code').value.trim();
  const name = document.getElementById('subject-name').value.trim();
  const teacherId = el.subjectTeacherSelect.value;
  
  // Read multi-day checkboxes
  const dayCheckboxes = document.querySelectorAll('.day-checkbox:checked');
  const scheduledDays = Array.from(dayCheckboxes).map(cb => cb.value);
  
  const room = document.getElementById('subject-room').value.trim();
  const timeStart = document.getElementById('subject-time-start').value;
  const timeEnd = document.getElementById('subject-time-end').value;

  if (!code || !name || !teacherId || scheduledDays.length === 0 || !room || !timeStart || !timeEnd) {
    showToast("Please fill all subject configuration fields, and select at least one day.", "error");
    return;
  }

  const teacher = state.teachers[teacherId];
  if (!teacher) return;

  const subjectRef = push(ref(db, 'subjects'));
  const subjectId = subjectRef.key;

  const subjectData = {
    id: subjectId,
    code: code,
    name: name,
    teacherId: teacherId,
    teacherName: teacher.name,
    day: scheduledDays[0], // Keep for backward compatibility with code expecting a single string
    scheduledDays: scheduledDays,
    room: room,
    timeStart: timeStart,
    timeEnd: timeEnd
  };

  try {
    await set(subjectRef, subjectData);
    el.addSubjectForm.reset();
    showToast(`Subject ${code} created successfully!`);
  } catch (error) {
    console.error("Failed to add subject", error);
    showToast("Failed to create subject in database.", "error");
  }
}

// Admin Delete Subject
async function handleDeleteSubject(id, name) {
  if (!confirm(`Are you sure you want to delete the subject: ${name}? All related real-time attendance records for this subject will also be deleted.`)) {
    return;
  }

  try {
    await remove(ref(db, `subjects/${id}`));
    // Cleanup related attendance
    await remove(ref(db, `attendance/${id}`));
    showToast(`Deleted subject: ${name}`);
  } catch (error) {
    console.error("Failed to delete subject", error);
    showToast("Database deletion failed.", "error");
  }
}

// Admin Change Admin Password
async function handleChangeAdminPassword(e) {
  if (e && e.preventDefault) e.preventDefault();
  const currentPwd = document.getElementById('admin-current-password').value;
  const newPwd = document.getElementById('admin-new-password').value;
  const confirmPwd = document.getElementById('admin-confirm-password').value;

  if (newPwd !== confirmPwd) {
    showToast("New passwords do not match.", "error");
    return;
  }

  if (newPwd.length < 6) {
    showToast("Password must be at least 6 characters.", "error");
    return;
  }

  try {
    let isCurrentValid = false;

    // Check secure admin_credentials credentials node
    const credRef = ref(db, 'admin_credentials');
    const snapshot = await get(credRef);

    if (snapshot.exists()) {
      const creds = snapshot.val();
      const calculatedHash = await hashPassword(currentPwd, creds.salt);
      if (calculatedHash === creds.passwordHash) {
        isCurrentValid = true;
      }
    } else {
      // Legacy check
      const legacySnapshot = await get(ref(db, 'settings/adminPassword'));
      const actualCurrentPwd = legacySnapshot.exists() ? legacySnapshot.val() : "admin123";
      if (currentPwd === actualCurrentPwd) {
        isCurrentValid = true;
      }
    }

    if (!isCurrentValid) {
      showToast("Current administrator password is incorrect.", "error");
      return;
    }

    const salt = generateSalt();
    const hash = await hashPassword(newPwd, salt);

    // Save secure hashed credentials
    await set(ref(db, 'admin_credentials'), {
      passwordHash: hash,
      salt: salt
    });
    
    // Purge plaintext fallback
    await remove(ref(db, 'settings/adminPassword'));

    el.adminPasswordForm.reset();
    showToast("Administrator password updated successfully!");
  } catch (error) {
    console.error("Failed to change admin password", error);
    showToast("Database error during password update.", "error");
  }
}


// ================= ADMIN STUDENT MANAGEMENT =================

function renderAdminStudentsTable() {
  if (!el.adminStudentsTbody) return;
  el.adminStudentsTbody.innerHTML = '';
  const list = Object.values(state.students || {});

  if (list.length === 0) {
    el.adminStudentsTbody.innerHTML = '<tr><td colspan="5" class="text-center">No student accounts registered.</td></tr>';
    return;
  }

  list.forEach(student => {
    const tr = document.createElement('tr');
    const fullName = `${student.firstName} ${student.middleName ? student.middleName + ' ' : ''}${student.lastName}`;
    const loginType = student.email ? 'Google' : 'Credentials';
    
    // Count enrolled subjects for this student
    const enrollments = state.subject_enrollments ? Object.keys(state.subject_enrollments).filter(subj => state.subject_enrollments[subj] && state.subject_enrollments[subj][student.uid]) : [];
    
    tr.innerHTML = `
      <td><strong>${student.studentIdNumber || 'N/A'}</strong></td>
      <td>${fullName}</td>
      <td><span class="role-badge">${loginType}</span></td>
      <td>${enrollments.length} Subject(s)</td>
      <td>
        <button class="btn-icon" title="Edit Profile" data-action="edit-student" data-uid="${student.uid}">
          <i data-lucide="edit-3"></i>
        </button>
        <button class="btn-icon" title="Assign Subjects" data-action="assign-subjects" data-uid="${student.uid}">
          <i data-lucide="book-marked"></i>
        </button>
        <button class="btn-icon" title="Reset Password" data-action="reset-password" data-uid="${student.uid}" ${loginType === 'Google' ? 'disabled' : ''}>
          <i data-lucide="key-round"></i>
        </button>
        <button class="btn-icon btn-icon-danger" title="Delete Student" data-action="delete-student" data-uid="${student.uid}">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    `;

    tr.querySelector('[data-action="edit-student"]').addEventListener('click', () => {
      openEditStudentModal(student);
    });
    tr.querySelector('[data-action="assign-subjects"]').addEventListener('click', () => {
      openAssignSubjectsModal(student.uid, fullName);
    });
    const pwdBtn = tr.querySelector('[data-action="reset-password"]');
    if (!pwdBtn.disabled) {
      pwdBtn.addEventListener('click', () => {
        openResetStudentPasswordModal(student.uid, fullName);
      });
    }
    tr.querySelector('[data-action="delete-student"]').addEventListener('click', () => {
      openDeleteStudentConfirmModal(student.uid, fullName);
    });

    el.adminStudentsTbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

async function handleAddStudentAdmin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const firstName = el.newStudentFirstName.value.trim();
  const lastName = el.newStudentLastName.value.trim();
  const middleName = el.newStudentMiddleName.value.trim();
  const studentId = el.newStudentId.value.trim();
  const password = el.newStudentPassword.value;

  if (!firstName || !lastName || !studentId || !password) {
    showToast("Required fields are missing.", "error");
    return;
  }

  // Check if student ID already exists
  const existingUsernameSnapshot = await get(ref(db, `student_usernames/${studentId}`));
  if (existingUsernameSnapshot.exists()) {
    showToast("Student ID already exists.", "error");
    return;
  }

  // Generate unique UID
  const studentRef = push(ref(db, 'students'));
  const uid = studentRef.key;

  // Salt and hash the password
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);

  const profileData = {
    uid,
    firstName,
    lastName,
    middleName,
    studentIdNumber: studentId,
    registeredAt: serverTimestamp()
  };

  const usernameData = { uid };
  const credsData = { salt, hash };

  try {
    const updates = {};
    updates[`students/${uid}`] = profileData;
    updates[`student_usernames/${studentId}`] = usernameData;
    updates[`student_credentials/${uid}`] = credsData;
    await update(ref(db), updates);
    showToast(`Student ${firstName} ${lastName} created successfully.`);
    el.addStudentForm.reset();
  } catch (error) {
    console.error("Failed to create student", error);
    showToast("Failed to create student", "error");
  }
}

function openEditStudentModal(student) {
  el.editStudentUid.value = student.uid;
  el.editStudentFirstName.value = student.firstName || '';
  el.editStudentMiddleName.value = student.middleName || '';
  el.editStudentLastName.value = student.lastName || '';
  el.editStudentIdNumber.value = student.studentIdNumber || '';
  
  // Store old ID to track if it changes
  el.editStudentIdNumber.setAttribute('data-old-id', student.studentIdNumber || '');
  
  toggleModal(el.modalEditStudent, true);
}

async function handleEditStudentAdmin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const uid = el.editStudentUid.value;
  const firstName = el.editStudentFirstName.value.trim();
  const middleName = el.editStudentMiddleName.value.trim();
  const lastName = el.editStudentLastName.value.trim();
  const studentId = el.editStudentIdNumber.value.trim();
  const oldStudentId = el.editStudentIdNumber.getAttribute('data-old-id');

  if (!firstName || !lastName || !studentId) {
    showToast("Required fields are missing.", "error");
    return;
  }

  const updates = {};
  
  // If student ID changed, verify the new one doesn't exist and move it
  if (studentId !== oldStudentId) {
    const existingSnapshot = await get(ref(db, `student_usernames/${studentId}`));
    if (existingSnapshot.exists()) {
      showToast("Student ID already exists.", "error");
      return;
    }
    // Remove old mapping and add new
    if (oldStudentId) {
      updates[`student_usernames/${oldStudentId}`] = null;
    }
    updates[`student_usernames/${studentId}`] = { uid };
  }

  updates[`students/${uid}/firstName`] = firstName;
  updates[`students/${uid}/middleName`] = middleName;
  updates[`students/${uid}/lastName`] = lastName;
  updates[`students/${uid}/studentIdNumber`] = studentId;

  try {
    await update(ref(db), updates);
    showToast(`Student profile updated.`);
    toggleModal(el.modalEditStudent, false);
  } catch (error) {
    console.error("Failed to update student profile", error);
    showToast("Update failed", "error");
  }
}

async function openAssignSubjectsModal(uid, fullName) {
  el.assignSubjectsStudentUid.value = uid;
  el.assignSubjectsStudentName.textContent = `Enrolling: ${fullName}`;
  el.assignSubjectsList.innerHTML = '';
  
  const subjects = Object.values(state.subjects || {});
  if (subjects.length === 0) {
    el.assignSubjectsList.innerHTML = '<p class="text-muted text-center" style="padding:1rem;">No subjects available.</p>';
  } else {
    // Fetch currently enrolled subjects for this user
    let currentEnrollments = {};
    const snapshot = await get(ref(db, 'subject_enrollments'));
    if (snapshot.exists()) {
      const allEnroll = snapshot.val();
      subjects.forEach(subj => {
        if (allEnroll[subj.id] && allEnroll[subj.id][uid]) {
          currentEnrollments[subj.id] = true;
        }
      });
    }

    subjects.forEach(subj => {
      const isEnrolled = currentEnrollments[subj.id] ? 'checked' : '';
      el.assignSubjectsList.innerHTML += `
        <label class="subject-checkbox-label">
          <input type="checkbox" name="student-subjects" value="${subj.id}" class="subject-checkbox" ${isEnrolled}>
          <div>
            <strong>${subj.code}</strong>
            <p>${subj.name} • ${subj.teacherName}</p>
          </div>
        </label>
      `;
    });
  }
  
  toggleModal(el.modalAssignSubjects, true);
}

async function handleAssignSubjectsAdmin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const uid = el.assignSubjectsStudentUid.value;
  const checkboxes = document.querySelectorAll('input[name="student-subjects"]');
  
  const updates = {};
  // For each subject, set the enrollment for this UID
  checkboxes.forEach(cb => {
    const subjId = cb.value;
    if (cb.checked) {
      updates[`subject_enrollments/${subjId}/${uid}`] = { enrolledAt: serverTimestamp() };
    } else {
      updates[`subject_enrollments/${subjId}/${uid}`] = null; // Unenroll
    }
  });

  try {
    await update(ref(db), updates);
    showToast(`Student enrollments saved.`);
    toggleModal(el.modalAssignSubjects, false);
    // Refresh table immediately to update count
    renderAdminStudentsTable();
  } catch (error) {
    console.error("Failed to assign subjects", error);
    showToast("Enrollment update failed.", "error");
  }
}

function openResetStudentPasswordModal(uid, fullName) {
  el.resetStudentUid.value = uid;
  el.resetStudentPwdSubtitle.textContent = `Resetting password for: ${fullName}`;
  el.resetStudentNewPassword.value = '';
  toggleModal(el.modalResetStudentPassword, true);
}

async function handleResetStudentPasswordAdmin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const uid = el.resetStudentUid.value;
  const newPassword = el.resetStudentNewPassword.value;

  if (!newPassword) {
    showToast("Password cannot be empty.", "error");
    return;
  }

  try {
    const salt = generateSalt();
    const hash = await hashPassword(newPassword, salt);
    
    await update(ref(db, `student_credentials/${uid}`), { salt, hash });
    showToast("Student password reset successfully.");
    toggleModal(el.modalResetStudentPassword, false);
  } catch (error) {
    console.error("Failed to reset password", error);
    showToast("Password reset failed.", "error");
  }
}

function openDeleteStudentConfirmModal(uid, fullName) {
  el.deleteStudentUid.value = uid;
  el.deleteStudentConfirmName.textContent = `Delete: ${fullName}`;
  toggleModal(el.modalDeleteStudentConfirm, true);
}

async function handleConfirmDeleteStudentAdmin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const uid = el.deleteStudentUid.value;
  
  if (!uid) return;
  const student = state.students[uid];
  
  try {
    const updates = {};
    updates[`students/${uid}`] = null;
    updates[`student_credentials/${uid}`] = null;
    if (student && student.studentIdNumber) {
      updates[`student_usernames/${student.studentIdNumber}`] = null;
    }
    
    // Unenroll from all subjects
    const snapshot = await get(ref(db, 'subject_enrollments'));
    if (snapshot.exists()) {
      const allEnroll = snapshot.val();
      Object.keys(allEnroll).forEach(subjId => {
        if (allEnroll[subjId] && allEnroll[subjId][uid]) {
          updates[`subject_enrollments/${subjId}/${uid}`] = null;
        }
      });
    }

    await update(ref(db), updates);
    showToast("Student account deleted permanently.");
    toggleModal(el.modalDeleteStudentConfirm, false);
  } catch (error) {
    console.error("Failed to delete student", error);
    showToast("Deletion failed.", "error");
  }
}


// ================= INTERACTIVE CALENDAR ENGINE =================
// Renders our fully responsive CSS Grid calendar for students and teachers
function resetCalendar(role) {
  const now = new Date();
  state.calendarMonth = now.getMonth();
  state.calendarYear = now.getFullYear();
  renderCalendar(role);
}

function navigateCalendar(direction, role) {
  state.calendarMonth += direction;
  if (state.calendarMonth < 0) {
    state.calendarMonth = 11;
    state.calendarYear--;
  } else if (state.calendarMonth > 11) {
    state.calendarMonth = 0;
    state.calendarYear++;
  }
  renderCalendar(role);
}

function renderCalendar(role) {
  const container = (role === 'student') ? el.studentCalendarDays : el.teacherCalendarDays;
  const titleEl = (role === 'student') ? el.studentCalendarTitle : el.teacherCalendarTitle;
  
  if (!container || !titleEl) return;

  container.innerHTML = '';

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  titleEl.textContent = `${monthNames[state.calendarMonth]} ${state.calendarYear}`;

  // Get first day of the month and total days
  const firstDayIndex = new Date(state.calendarYear, state.calendarMonth, 1).getDay();
  const totalDays = new Date(state.calendarYear, state.calendarMonth + 1, 0).getDate();

  // 1. Draw empty padding cells for prior days of the week
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    container.appendChild(emptyCell);
  }

  // Get current date details to highlight "Today"
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === state.calendarYear && today.getMonth() === state.calendarMonth;

  // 2. Loop and generate each calendar day cell
  for (let day = 1; day <= totalDays; day++) {
    const dateCell = document.createElement('div');
    dateCell.className = 'calendar-day';
    
    if (isCurrentMonth && today.getDate() === day) {
      dateCell.classList.add('today');
    }

    const cellDateStr = `${state.calendarYear}-${String(state.calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekdayName = getWeekdayName(new Date(state.calendarYear, state.calendarMonth, day).getDay());

    dateCell.innerHTML = `<span class="calendar-day-num">${day}</span>`;

    // Dynamic indicators holder
    const indicatorsWrapper = document.createElement('div');
    indicatorsWrapper.className = 'day-indicators';
    dateCell.appendChild(indicatorsWrapper);

    // --- Data Mapping depending on Role ---
    if (role === 'student') {
      mapStudentDayData(dateCell, indicatorsWrapper, cellDateStr, weekdayName);
    } else if (role === 'teacher') {
      mapTeacherDayData(dateCell, indicatorsWrapper, cellDateStr, weekdayName);
    }

    container.appendChild(dateCell);
  }
}

// MAPPING STUDENT SCHEDULE & ATTENDANCE RECORD TO CELL
function mapStudentDayData(cellEl, indicatorsEl, cellDateStr, weekdayName) {
  let hasSchedule = false;
  let attendanceRecord = null;
  let scheduledSubjects = [];
  const studentUid = state.studentProfile ? state.studentProfile.uid : null;

  if (!studentUid) return;

  // Check if student has class schedules on this day for enrolled subjects
  Object.values(state.subjects).forEach(subject => {
    const isEnrolled = state.subjectEnrollments && 
                       state.subjectEnrollments[subject.id] && 
                       state.subjectEnrollments[subject.id][studentUid];
    
    if (isEnrolled) {
      const days = subject.scheduledDays || [subject.day];
      if (days.includes(weekdayName)) {
        hasSchedule = true;
        scheduledSubjects.push(subject);
      }
    }
  });

  // Check if student has attendance record for this day
  Object.keys(state.attendance).forEach(subjectId => {
    const datesNode = state.attendance[subjectId];
    if (datesNode && datesNode[cellDateStr]) {
      const dateRecordNode = datesNode[cellDateStr];
      if (dateRecordNode[studentUid]) {
        attendanceRecord = dateRecordNode[studentUid];
        // Attach subject details to attendance record for modal popup
        attendanceRecord.subject = state.subjects[subjectId];
      }
    }
  });

  // Draw visual badges in cell
  if (hasSchedule) {
    const dot = document.createElement('span');
    dot.className = 'indicator-dot indicator-schedule';
    indicatorsEl.appendChild(dot);
  }

  if (attendanceRecord) {
    const badge = document.createElement('div');
    badge.className = `attendance-badge ${attendanceRecord.status.toLowerCase()}`;
    
    let iconName = 'check';
    if (attendanceRecord.status === 'Absent') iconName = 'x';
    else if (attendanceRecord.status === 'Late') iconName = 'clock';
    
    badge.innerHTML = `<i data-lucide="${iconName}"></i>`;
    cellEl.appendChild(badge);
  }

  // Cell Click Popup Details Modal
  cellEl.addEventListener('click', () => {
    openDayDetailsModal(cellDateStr, scheduledSubjects, attendanceRecord, 'student');
  });
}

// MAPPING TEACHER SCHEDULES TO CELL
function mapTeacherDayData(cellEl, indicatorsEl, cellDateStr, weekdayName) {
  let hasSchedule = false;
  let teachingSubjects = [];

  if (!state.teacherProfile) return;

  // Check if teacher has teaching schedule on this weekday
  Object.values(state.subjects).forEach(subject => {
    if (subject.teacherId === state.teacherProfile.uid) {
      const days = subject.scheduledDays || [subject.day];
      if (days.includes(weekdayName)) {
        hasSchedule = true;
        teachingSubjects.push(subject);
      }
    }
  });

  if (hasSchedule) {
    const dot = document.createElement('span');
    dot.className = 'indicator-dot indicator-schedule';
    indicatorsEl.appendChild(dot);
    
    // Tiny indicator of number of classes today
    const numBadge = document.createElement('span');
    numBadge.style.fontSize = '0.65rem';
    numBadge.style.color = 'var(--accent-secondary)';
    numBadge.style.fontWeight = '700';
    numBadge.textContent = `${teachingSubjects.length} class${teachingSubjects.length > 1 ? 'es' : ''}`;
    cellEl.appendChild(numBadge);
  }

  cellEl.addEventListener('click', () => {
    openDayDetailsModal(cellDateStr, teachingSubjects, null, 'teacher');
  });
}

// Detailed popup showing schedules and attendance logs for clicked calendar cell
function openDayDetailsModal(dateStr, schedules, attendance, role) {
  el.dayModalTitle.textContent = formatDateHumanReadable(dateStr);
  el.dayModalContent.innerHTML = '';
  
  if (role === 'student') {
    el.dayModalSubtitle.textContent = "Your class schedule and attendance record for today.";
    
    if (schedules.length === 0 && !attendance) {
      el.dayModalContent.innerHTML = '<div class="empty-state">No classes scheduled and no attendance records.</div>';
    } else {
      // 1. Show attendance record if exists
      if (attendance) {
        const sect = document.createElement('div');
        sect.className = 'modal-day-section';
        const scanTime = new Date(attendance.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        sect.innerHTML = `
          <div class="modal-sched-header">
            <span class="modal-sched-title">Attendance Recorded</span>
            <span class="modal-sched-badge present">${attendance.status}</span>
          </div>
          <div class="modal-sched-details">
            <div class="modal-sched-detail-item"><i data-lucide="book-open"></i> ${attendance.subject ? attendance.subject.name : 'Subject'}</div>
            <div class="modal-sched-detail-item"><i data-lucide="clock"></i> Check-in: ${scanTime}</div>
          </div>
        `;
        el.dayModalContent.appendChild(sect);
      }

      // 2. List scheduled classes
      if (schedules.length > 0) {
        const header = document.createElement('h4');
        header.style.fontSize = '0.9rem';
        header.style.color = 'var(--text-muted)';
        header.style.marginTop = '1rem';
        header.style.marginBottom = '0.5rem';
        header.textContent = "Scheduled Classes:";
        el.dayModalContent.appendChild(header);

        schedules.forEach(subj => {
          const sect = document.createElement('div');
          sect.className = 'modal-day-section';
          sect.innerHTML = `
            <div class="modal-sched-header">
              <span class="modal-sched-title">${subj.code}: ${subj.name}</span>
              <span class="modal-sched-badge not-taken">Scheduled</span>
            </div>
            <div class="modal-sched-details">
              <div class="modal-sched-detail-item"><i data-lucide="clock"></i> ${subj.timeStart} - ${subj.timeEnd}</div>
              <div class="modal-sched-detail-item"><i data-lucide="map-pin"></i> Room: ${subj.room}</div>
              <div class="modal-sched-detail-item" style="grid-column: 1 / span 2;"><i data-lucide="user"></i> Prof. ${subj.teacherName}</div>
            </div>
          `;
          el.dayModalContent.appendChild(sect);
        });
      }
    }
  } else if (role === 'teacher') {
    el.dayModalSubtitle.textContent = "Your teaching schedule for today.";
    
    if (schedules.length === 0) {
      el.dayModalContent.innerHTML = '<div class="empty-state">No classes scheduled for you today.</div>';
    } else {
      schedules.forEach(subj => {
        // Fetch how many checked in today in RTDB
        const subjectAttendance = state.attendance[subj.id];
        const presentTodayCount = (subjectAttendance && subjectAttendance[dateStr]) ? Object.keys(subjectAttendance[dateStr]).length : 0;

        const sect = document.createElement('div');
        sect.className = 'modal-day-section';
        sect.innerHTML = `
          <div class="modal-sched-header">
            <span class="modal-sched-title">${subj.code}: ${subj.name}</span>
            <span class="modal-sched-badge present" style="background: rgba(99, 102, 241, 0.15); color: #c7d2fe; border-color: rgba(99, 102, 241, 0.3)">${presentTodayCount} Attended</span>
          </div>
          <div class="modal-sched-details">
            <div class="modal-sched-detail-item"><i data-lucide="clock"></i> Hours: ${subj.timeStart} - ${subj.timeEnd}</div>
            <div class="modal-sched-detail-item"><i data-lucide="map-pin"></i> Room: ${subj.room}</div>
          </div>
        `;
        el.dayModalContent.appendChild(sect);
      });
    }
  }

  toggleModal(el.modalDayDetails, true);
  lucide.createIcons();
}

// ================= TEACHER JOIN QR & STUDENT JOIN SCANNER IMPLEMENTATION =================

function openTeacherJoinQrModal() {
  if (!state.teacherProfile) return;
  
  // Populate the select dropdown with teacher's subjects
  const select = el.teacherJoinQrSelect;
  select.innerHTML = '<option value="">-- Choose Subject --</option>';
  
  let firstSubjectId = "";
  Object.values(state.subjects).forEach(subject => {
    if (subject.teacherId === state.teacherProfile.uid) {
      const option = document.createElement('option');
      option.value = subject.id;
      option.textContent = `${subject.code} - ${subject.name}`;
      select.appendChild(option);
      if (!firstSubjectId) firstSubjectId = subject.id;
    }
  });

  // Select first subject by default if available
  if (firstSubjectId) {
    select.value = firstSubjectId;
    state.activeJoinSubjectId = firstSubjectId;
    el.teacherJoinQrSubjectName.textContent = state.subjects[firstSubjectId].name;
    generateTeacherJoinQr();
    startTeacherJoinQrGenerator();
  } else {
    state.activeJoinSubjectId = null;
    el.teacherJoinQrSubjectName.textContent = "No subjects assigned";
    // Clear canvas
    const canvas = el.teacherJoinQrCanvas;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  toggleModal(el.modalTeacherJoinQr, true);
}

function closeTeacherJoinQrModal() {
  stopTeacherJoinQrGenerator();
  toggleModal(el.modalTeacherJoinQr, false);
}

function handleTeacherJoinQrSubjectChange(subjectId) {
  state.activeJoinSubjectId = subjectId;
  if (subjectId && state.subjects[subjectId]) {
    el.teacherJoinQrSubjectName.textContent = state.subjects[subjectId].name;
    generateTeacherJoinQr();
    startTeacherJoinQrGenerator();
  } else {
    el.teacherJoinQrSubjectName.textContent = "Select a subject";
    stopTeacherJoinQrGenerator();
    const canvas = el.teacherJoinQrCanvas;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

async function generateTeacherJoinQr() {
  const subjectId = state.activeJoinSubjectId;
  if (!subjectId || !state.subjects[subjectId]) return;

  const subject = state.subjects[subjectId];
  const now = getSyncedDate();
  
  // Generate a random 6-character One-Time Password (OTP) for joining
  const otp = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  // Write OTP to DB join_tokens node
  try {
    const tokenRef = ref(db, `join_tokens/${subjectId}`);
    await set(tokenRef, {
      otp: otp,
      timestamp: serverTimestamp(),
      subjectId: subjectId
    });
  } catch (err) {
    console.error("Failed to write join token", err);
  }

  const payloadObj = {
    y: "join",
    s: subjectId,
    t: now.getTime(),
    o: otp
  };

  const payloadString = JSON.stringify(payloadObj);

  if (typeof QRious !== 'undefined' && el.teacherJoinQrCanvas) {
    new QRious({
      element: el.teacherJoinQrCanvas,
      value: payloadString,
      size: 350,
      background: '#ffffff',
      foreground: '#0b0f19',
      level: 'M'
    });
  } else {
    console.error("QRious library not loaded or canvas missing.");
  }
}

function startTeacherJoinQrGenerator() {
  stopTeacherJoinQrGenerator();
  
  state.teacherJoinQrTimeRemaining = 30;
  if (el.teacherJoinQrTimer) {
    el.teacherJoinQrTimer.textContent = `${state.teacherJoinQrTimeRemaining}s`;
  }

  state.teacherJoinQrInterval = setInterval(() => {
    state.teacherJoinQrTimeRemaining--;
    
    if (state.teacherJoinQrTimeRemaining <= 0) {
      state.teacherJoinQrTimeRemaining = 30;
      generateTeacherJoinQr();
    }
    
    if (el.teacherJoinQrTimer) {
      el.teacherJoinQrTimer.textContent = `${state.teacherJoinQrTimeRemaining}s`;
    }
  }, 1000);
}

function stopTeacherJoinQrGenerator() {
  if (state.teacherJoinQrInterval) {
    clearInterval(state.teacherJoinQrInterval);
    state.teacherJoinQrInterval = null;
  }
}

function openStudentJoinScanner() {
  state.isStudentJoinCameraRunning = true;
  if (el.studentJoinStatus) {
    el.studentJoinStatus.textContent = "Camera Streaming...";
    el.studentJoinStatus.style.color = "var(--status-success)";
  }
  toggleModal(el.modalStudentJoinScanner, true);

  // Initialize html5-qrcode scanner for student join
  state.studentJoinQrScanner = new Html5Qrcode("student-join-reader");
  
  // Dynamic responsive qrbox sizing function
  const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const qrboxSize = Math.floor(minEdge * 0.85);
    return {
      width: qrboxSize,
      height: qrboxSize
    };
  };

  const config = { 
    fps: 25, 
    qrbox: qrboxFunction,
    aspectRatio: 1.0,
    videoConstraints: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  startHtml5QrScannerWithFallback(
    state.studentJoinQrScanner,
    config,
    onStudentJoinQrSuccess,
    onStudentJoinQrFailure
  ).then(() => {
    // Set up zoom controls after camera starts
    setupCameraZoom('student-join-reader', 'join-zoom-slider', 'join-zoom-label', 'join-zoom-row');
  }).catch(err => {
    console.error("Join Camera startup failed", err);
    if (el.studentJoinStatus) {
      el.studentJoinStatus.textContent = "Failed to open camera. Grant permissions.";
      el.studentJoinStatus.style.color = "var(--status-error)";
    }
    stopStudentJoinScanner();
  });
}

function stopStudentJoinScanner() {
  state.isStudentJoinCameraRunning = false;
  if (el.studentJoinStatus) {
    el.studentJoinStatus.textContent = "Scanner Stopped";
    el.studentJoinStatus.style.color = "var(--text-muted)";
  }

  // Reset zoom controls
  const zoomRow = document.getElementById('join-zoom-row');
  const zoomSlider = document.getElementById('join-zoom-slider');
  const zoomLabel = document.getElementById('join-zoom-label');
  if (zoomRow) zoomRow.style.display = 'none';
  if (zoomSlider) { zoomSlider.value = 1; zoomSlider.style.setProperty('--zoom-pct', '0%'); }
  if (zoomLabel) zoomLabel.textContent = '1×';
  
  if (state.studentJoinQrScanner) {
    state.studentJoinQrScanner.stop().then(() => {
      state.studentJoinQrScanner = null;
    }).catch(err => {
      console.error("Error stopping student join scanner", err);
      state.studentJoinQrScanner = null;
    });
  }
}

function closeStudentJoinScanner() {
  stopStudentJoinScanner();
  toggleModal(el.modalStudentJoinScanner, false);
}

function onStudentJoinQrSuccess(decodedText) {
  try {
    const qrData = JSON.parse(decodedText);
    const type = qrData.y || qrData.type;
    if (type === 'join') {
      validateAndEnrollSubject(qrData);
    } else {
      showToast("This is not a subject Join QR code.", "error");
    }
  } catch (error) {
    showToast("Invalid QR Code format.", "error");
  }
}

function onStudentJoinQrFailure(error) {
  // Silence verbose scanning noise
}

async function validateAndEnrollSubject(qrData) {
  const studentUid = state.studentProfile ? state.studentProfile.uid : null;
  const subjectId = qrData.s || qrData.subjectId;
  const otp = qrData.o || qrData.otp;
  const timestamp = qrData.t || qrData.timestamp;
  const now = getSyncedDate();

  if (!studentUid || !subjectId || !otp || !timestamp) {
    showToast("Malformed Join QR code.", "error");
    return;
  }

  // Verify OTP matches the database join_token
  try {
    // Temporarily stop scanner to prevent multiple scans
    stopStudentJoinScanner();

    const tokenRef = ref(db, `join_tokens/${subjectId}`);
    const snapshot = await get(tokenRef);

    if (!snapshot.exists()) {
      playSound('error');
      showToast("Join QR code has expired or is invalid.", "error");
      openStudentJoinScanner();
      return;
    }

    const tokenData = snapshot.val();

    if (tokenData.otp !== otp) {
      playSound('error');
      showToast("Verification failed. Please scan a live QR code.", "error");
      openStudentJoinScanner();
      return;
    }

    // Verify token age (must be within 30 seconds)
    const tokenTime = new Date(tokenData.timestamp);
    const timeDiff = (now.getTime() - tokenTime.getTime()) / 1000;
    if (Math.abs(timeDiff) > 30) {
      playSound('error');
      showToast("QR code expired. Please ask teacher to refresh.", "error");
      openStudentJoinScanner();
      return;
    }

    // Write enrollment to Realtime Database
    const enrollRef = ref(db, `subject_enrollments/${subjectId}/${studentUid}`);
    await set(enrollRef, {
      joinedAt: serverTimestamp(),
      studentName: `${state.studentProfile.firstName} ${state.studentProfile.lastName}`,
      studentIdNumber: state.studentProfile.studentIdNumber || 'N/A'
    });

    playSound('success');
    const displaySubjectName = (state.subjects && state.subjects[subjectId]) ? state.subjects[subjectId].name : (qrData.subjectName || qrData.subjectCode || "Subject");
    showToast(`Successfully joined subject: ${displaySubjectName}!`);
    toggleModal(el.modalStudentJoinScanner, false);
  } catch (err) {
    console.error("Error during student subject enrollment", err);
    playSound('error');
    showToast("Failed to join subject. Database error.", "error");
    openStudentJoinScanner();
  }
}

// ================= UTILITIES & HELPERS =================
function getWeekdayName(index) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[index];
}

function getFormattedDateString(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateHumanReadable(dateStr) {
  const parts = dateStr.split('-');
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}


// ================= TEACHER ATTENDANCE QR (Students scan to self-record) =================

/**
 * Opens the Teacher Attendance QR modal.
 * Populates subject dropdown with teacher's own subjects.
 * Auto-selects first subject if available and starts the QR generator.
 */
function openTeacherAttendanceQrModal() {
  if (!state.teacherProfile) return;

  const select = el.teacherAttendanceQrSelect;
  select.innerHTML = '<option value="">-- Choose Subject --</option>';

  let firstSubjectId = "";
  Object.values(state.subjects).forEach(subject => {
    if (subject.teacherId === state.teacherProfile.uid) {
      const option = document.createElement('option');
      option.value = subject.id;
      option.textContent = `${subject.code} - ${subject.name}`;
      select.appendChild(option);
      if (!firstSubjectId) firstSubjectId = subject.id;
    }
  });

  if (firstSubjectId) {
    select.value = firstSubjectId;
    state.activeAttendanceSubjectId = firstSubjectId;
    el.teacherAttendanceQrSubjectName.textContent = state.subjects[firstSubjectId].name;
    generateTeacherAttendanceQr();
    startTeacherAttendanceQrGenerator();
  } else {
    state.activeAttendanceSubjectId = null;
    el.teacherAttendanceQrSubjectName.textContent = "No subjects assigned";
    const canvas = el.teacherAttendanceQrCanvas;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  toggleModal(el.modalTeacherAttendanceQr, true);
}

function closeTeacherAttendanceQrModal() {
  stopTeacherAttendanceQrGenerator();
  toggleModal(el.modalTeacherAttendanceQr, false);
}

function handleTeacherAttendanceQrSubjectChange(subjectId) {
  state.activeAttendanceSubjectId = subjectId;
  if (subjectId && state.subjects[subjectId]) {
    el.teacherAttendanceQrSubjectName.textContent = state.subjects[subjectId].name;
    generateTeacherAttendanceQr();
    startTeacherAttendanceQrGenerator();
  } else {
    el.teacherAttendanceQrSubjectName.textContent = "Select a subject";
    stopTeacherAttendanceQrGenerator();
    const canvas = el.teacherAttendanceQrCanvas;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

/**
 * Generates a fresh signed Attendance QR Code for the active subject.
 * Writes a fresh OTP + timestamp to Firebase at: attendance_tokens/{subjectId}
 * QR payload: { y:"attendance", s:subjectId, t:timestamp, o:otp }
 */
async function generateTeacherAttendanceQr() {
  const subjectId = state.activeAttendanceSubjectId;
  if (!subjectId || !state.subjects[subjectId]) return;

  const now = getSyncedDate();

  // Generate a cryptographic one-time-password
  const otp = Math.random().toString(36).substring(2, 10).toUpperCase();

  // Write OTP to Firebase so students can verify it
  try {
    const tokenRef = ref(db, `attendance_tokens/${subjectId}`);
    await set(tokenRef, {
      otp: otp,
      timestamp: serverTimestamp(),
      subjectId: subjectId,
      teacherId: state.teacherProfile.uid
    });
  } catch (err) {
    console.error("Failed to write attendance token", err);
  }

  const payloadObj = {
    y: "attendance",
    s: subjectId,
    t: now.getTime(),
    o: otp
  };

  const payloadString = JSON.stringify(payloadObj);

  if (typeof QRious !== 'undefined' && el.teacherAttendanceQrCanvas) {
    new QRious({
      element: el.teacherAttendanceQrCanvas,
      value: payloadString,
      size: 350,
      background: '#ffffff',
      foreground: '#0b0f19',
      level: 'M'
    });
  } else {
    console.error("QRious library not loaded or canvas missing.");
  }
}

function startTeacherAttendanceQrGenerator() {
  stopTeacherAttendanceQrGenerator();

  state.teacherAttendanceQrTimeRemaining = 30;
  if (el.teacherAttendanceQrTimer) {
    el.teacherAttendanceQrTimer.textContent = `${state.teacherAttendanceQrTimeRemaining}s`;
  }

  state.teacherAttendanceQrInterval = setInterval(() => {
    state.teacherAttendanceQrTimeRemaining--;

    if (state.teacherAttendanceQrTimeRemaining <= 0) {
      state.teacherAttendanceQrTimeRemaining = 30;
      generateTeacherAttendanceQr();
    }

    if (el.teacherAttendanceQrTimer) {
      el.teacherAttendanceQrTimer.textContent = `${state.teacherAttendanceQrTimeRemaining}s`;
    }
  }, 1000);
}

function stopTeacherAttendanceQrGenerator() {
  if (state.teacherAttendanceQrInterval) {
    clearInterval(state.teacherAttendanceQrInterval);
    state.teacherAttendanceQrInterval = null;
  }
}


// ================= STUDENT ATTENDANCE SCANNER (Scans Teacher's Attendance QR) =================

/**
 * Opens the student's camera to scan the teacher's Attendance QR code.
 */
function openStudentAttendanceScanner() {
  if (!state.studentProfile) {
    showToast("Student profile not found. Please log in again.", "error");
    return;
  }

  state.isStudentAttendanceCameraRunning = true;
  if (el.studentAttendanceStatus) {
    el.studentAttendanceStatus.textContent = "Camera Streaming — point at teacher's QR...";
    el.studentAttendanceStatus.style.color = "var(--status-success)";
  }
  toggleModal(el.modalStudentAttendanceScanner, true);

  state.studentAttendanceQrScanner = new Html5Qrcode("student-attendance-reader");

  const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const qrboxSize = Math.floor(minEdge * 0.85);
    return { width: qrboxSize, height: qrboxSize };
  };

  const config = {
    fps: 25,
    qrbox: qrboxFunction,
    aspectRatio: 1.0,
    videoConstraints: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  startHtml5QrScannerWithFallback(
    state.studentAttendanceQrScanner,
    config,
    onStudentAttendanceQrSuccess,
    onStudentAttendanceQrFailure
  ).then(() => {
    // Set up zoom controls after camera is live
    setupCameraZoom('student-attendance-reader', 'attendance-zoom-slider', 'attendance-zoom-label', 'attendance-zoom-row');
  }).catch(err => {
    console.error("Attendance scanner startup failed", err);
    if (el.studentAttendanceStatus) {
      el.studentAttendanceStatus.textContent = "Failed to open camera. Grant permissions.";
      el.studentAttendanceStatus.style.color = "var(--status-error)";
    }
    stopStudentAttendanceScanner();
  });
}

function stopStudentAttendanceScanner() {
  state.isStudentAttendanceCameraRunning = false;
  if (el.studentAttendanceStatus) {
    el.studentAttendanceStatus.textContent = "Scanner Stopped";
    el.studentAttendanceStatus.style.color = "var(--text-muted)";
  }

  // Reset zoom controls
  const zoomRow = document.getElementById('attendance-zoom-row');
  const zoomSlider = document.getElementById('attendance-zoom-slider');
  const zoomLabel = document.getElementById('attendance-zoom-label');
  if (zoomRow) zoomRow.style.display = 'none';
  if (zoomSlider) { zoomSlider.value = 1; zoomSlider.style.setProperty('--zoom-pct', '0%'); }
  if (zoomLabel) zoomLabel.textContent = '1×';

  if (state.studentAttendanceQrScanner) {
    state.studentAttendanceQrScanner.stop().then(() => {
      state.studentAttendanceQrScanner = null;
    }).catch(err => {
      console.error("Error stopping attendance scanner", err);
      state.studentAttendanceQrScanner = null;
    });
  }
}

function closeStudentAttendanceScanner() {
  stopStudentAttendanceScanner();
  toggleModal(el.modalStudentAttendanceScanner, false);
}

function onStudentAttendanceQrSuccess(decodedText) {
  // Prevent re-entry while processing
  if (state.isStudentAttendanceProcessing) return;

  try {
    const qrData = JSON.parse(decodedText);
    const type = qrData.y || qrData.type;
    if (type === 'attendance') {
      state.isStudentAttendanceProcessing = true;
      validateAndRecordStudentAttendance(qrData);
    } else {
      showToast("This is not an Attendance QR code. Ask teacher for the correct one.", "warning");
    }
  } catch (error) {
    showToast("Invalid QR Code format.", "error");
  }
}

function onStudentAttendanceQrFailure(error) {
  // Silence verbose scanning noise
}

/**
 * Validates the scanned Attendance QR against Firebase, then records attendance.
 * Security checks:
 *  1. QR payload must have y=="attendance", subjectId, otp, timestamp
 *  2. OTP must match attendance_tokens/{subjectId}.otp in Firebase
 *  3. Token must be no older than 35s (5s buffer for latency)
 *  4. Student must be enrolled in the subject
 *  5. Student must NOT already have an attendance record today
 */
async function validateAndRecordStudentAttendance(qrData) {
  const studentUid = state.studentProfile ? state.studentProfile.uid : null;
  const subjectId = qrData.s || qrData.subjectId;
  const otp = qrData.o || qrData.otp;
  const qrTimestamp = qrData.t || qrData.timestamp;
  const now = getSyncedDate();
  const todayStr = getFormattedDateString(now);

  // --- 1. Basic field validation ---
  if (!studentUid || !subjectId || !otp || !qrTimestamp) {
    playSound('error');
    showToast("Malformed QR code. Contact teacher.", "error");
    state.isStudentAttendanceProcessing = false;
    return;
  }

  // Stop scanner immediately so it doesn't fire again
  stopStudentAttendanceScanner();

  try {
    // --- 2. Fetch & validate Firebase token ---
    const tokenRef = ref(db, `attendance_tokens/${subjectId}`);
    const snapshot = await get(tokenRef);

    if (!snapshot.exists()) {
      playSound('error');
      showToast("Attendance QR has expired. Ask teacher to refresh.", "error");
      toggleModal(el.modalStudentAttendanceScanner, false);
      state.isStudentAttendanceProcessing = false;
      return;
    }

    const tokenData = snapshot.val();

    // --- 3. OTP Match ---
    if (tokenData.otp !== otp) {
      playSound('error');
      showToast("QR verification failed. Please scan the live code on screen.", "error");
      toggleModal(el.modalStudentAttendanceScanner, false);
      state.isStudentAttendanceProcessing = false;
      return;
    }

    // --- 4. Token age check (must be within 35 seconds) ---
    const tokenTime = new Date(tokenData.timestamp);
    const ageSec = (now.getTime() - tokenTime.getTime()) / 1000;
    if (ageSec > 35) {
      playSound('error');
      showToast("QR code expired (older than 30s). Ask teacher to refresh.", "error");
      toggleModal(el.modalStudentAttendanceScanner, false);
      state.isStudentAttendanceProcessing = false;
      return;
    }

    // --- 5. Enrollment check ---
    const isEnrolled = state.subjectEnrollments &&
                       state.subjectEnrollments[subjectId] &&
                       state.subjectEnrollments[subjectId][studentUid];
    if (!isEnrolled) {
      playSound('error');
      showToast("You are not enrolled in this subject. Scan the Join QR first.", "error");
      toggleModal(el.modalStudentAttendanceScanner, false);
      state.isStudentAttendanceProcessing = false;
      return;
    }

    // --- 6. Duplicate check: already marked present today? ---
    const existingAttendanceRef = ref(db, `attendance/${subjectId}/${todayStr}/${studentUid}`);
    const existingSnapshot = await get(existingAttendanceRef);
    if (existingSnapshot.exists()) {
      // Already recorded — still a success for the student
      playSound('success');
      showToast("You are already marked Present for today's class! ✓", "warning");
      toggleModal(el.modalStudentAttendanceScanner, false);
      state.isStudentAttendanceProcessing = false;
      return;
    }

    // --- 7. Write attendance record ---
    const studentName = `${state.studentProfile.firstName} ${state.studentProfile.lastName}`;
    const studentIdNo = state.studentProfile.studentIdNumber || 'N/A';

    const attendanceRecord = {
      studentId: studentUid,
      studentIdNumber: studentIdNo,
      name: studentName,
      timestamp: serverTimestamp(),
      status: "Present",
      scannedBy: tokenData.teacherId || "self-scan",
      method: "student-qr-scan"
    };

    await set(existingAttendanceRef, attendanceRecord);

    // --- 8. Success! ---
    playSound('success');
    showToast(`✓ Attendance recorded! Welcome, ${state.studentProfile.firstName}!`);
    toggleModal(el.modalStudentAttendanceScanner, false);

    // Full-screen green flash effect
    const flash = document.createElement('div');
    flash.className = 'scan-success-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 900);

    // Refresh student stats
    calculateStudentStats();
    renderCalendar('student');

  } catch (err) {
    console.error("Student attendance recording error", err);
    playSound('error');
    showToast("Failed to record attendance. Check your connection.", "error");
    toggleModal(el.modalStudentAttendanceScanner, false);
  } finally {
    state.isStudentAttendanceProcessing = false;
  }
}
