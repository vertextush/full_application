const getConfiguredBaseUrl = () => {
  const runtimeConfigUrl =
    window.APP_CONFIG && typeof window.APP_CONFIG.BACKEND_BASE_URL === "string"
      ? window.APP_CONFIG.BACKEND_BASE_URL.trim()
      : "";

  if (runtimeConfigUrl) {
    return runtimeConfigUrl;
  }

  const queryParams = new URLSearchParams(window.location.search);
  const queryUrl = (queryParams.get("backendUrl") || "").trim();

  if (queryUrl) {
    return queryUrl;
  }

  return `http://${window.location.hostname}:3000`;
};

const BASE_URL = getConfiguredBaseUrl().replace(/\/$/, "");
let editingUserId = null;

// ==================== DASHBOARD PAGE ====================
const loadDashboard = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/dashboard`);
    const data = await response.json();

    document.getElementById('userCount').textContent = data.statistics?.totalUsers || 0;
    document.getElementById('dbType').textContent = data.databaseType || 'Unknown';
    document.getElementById('appStatus').textContent = 'Connected';
    document.getElementById('uptime').textContent = formatUptime(data.statistics?.uptime || 0);
  } catch (error) {
    console.error("Failed to load dashboard:", error);
    document.getElementById('dashboardMessage').textContent = "Failed to load dashboard data";
    document.getElementById('dashboardMessage').className = "message error";
  }
};

const formatUptime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

// ==================== USERS PAGE ====================
const loadUsers = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/users`);

    if (!response.ok) {
      throw new Error(`Failed to load users: ${response.status}`);
    }

    const payload = await response.json();
    const users = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.users)
      ? payload.users
      : [];

    const usersList = document.getElementById("usersList");
    const noUsers = document.getElementById("noUsers");

    usersList.innerHTML = "";

    if (users.length === 0) {
      noUsers.style.display = "block";
      return;
    }

    noUsers.style.display = "none";

    users.forEach((user) => {
      const userCard = document.createElement("div");
      userCard.className = "user-card";
      const createdDate = user.created_at
        ? new Date(user.created_at).toLocaleDateString()
        : "N/A";
      userCard.innerHTML = `
        <div class="user-info">
          <div class="user-name">${user.name}</div>
          <div class="user-email">${user.email}</div>
          <div class="user-created">Created: ${createdDate}</div>
        </div>
        <div class="user-actions">
          <button class="secondary" onclick="editUser(${user.id}, '${user.name}', '${user.email}')">Edit</button>
          <button class="danger" onclick="deleteUser(${user.id})">Delete</button>
        </div>
      `;
      usersList.appendChild(userCard);
    });
  } catch (error) {
    console.error("Failed to load users:", error);
    showMessage("Failed to load users", "error");
  }
};

// ==================== SETTINGS PAGE ====================
const loadSettings = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/settings`);
    const data = await response.json();

    document.getElementById('appName').textContent = data.appName || 'N/A';
    document.getElementById('appVersion').textContent = data.version || 'N/A';
    document.getElementById('settingsDbType').textContent = data.database || 'N/A';
    document.getElementById('supportedDBs').textContent = (data.supportedDatabases || []).join(', ');
    
    const features = data.features || {};
    const featuresList = Object.entries(features)
      .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').trim()}: ${value ? '✓' : '✗'}`)
      .join(' | ');
    document.getElementById('features').textContent = featuresList;
  } catch (error) {
    console.error("Failed to load settings:", error);
    document.getElementById('settingsMessage').textContent = "Failed to load settings";
    document.getElementById('settingsMessage').className = "message error";
  }
};

// ==================== USER FORM HANDLERS ====================
const showMessage = (message, type = "success") => {
  const formMessage = document.getElementById("formMessage");
  if (formMessage) {
    formMessage.textContent = message;
    formMessage.className = `message ${type}`;
    setTimeout(() => {
      formMessage.textContent = "";
      formMessage.className = "message";
    }, 3000);
  }
};

const editUser = (id, name, email) => {
  editingUserId = id;
  document.getElementById("nameInput").value = name;
  document.getElementById("emailInput").value = email;
  document.getElementById("formTitle").textContent = "Edit User";
  document.getElementById("submitBtn").textContent = "Update User";
  document.getElementById("cancelBtn").style.display = "inline-block";
  document.getElementById("nameInput").focus();
};

const resetForm = () => {
  editingUserId = null;
  document.getElementById("userForm").reset();
  document.getElementById("formTitle").textContent = "Add New User";
  document.getElementById("submitBtn").textContent = "Create User";
  document.getElementById("cancelBtn").style.display = "none";
};

const deleteUser = async (id) => {
  if (!confirm("Are you sure you want to delete this user?")) return;

  try {
    const response = await fetch(`${BASE_URL}/api/users/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      showMessage("Failed to delete user", "error");
      return;
    }

    showMessage("User deleted successfully");
    loadUsers();
  } catch (error) {
    console.error("Delete error:", error);
    showMessage("Error deleting user", "error");
  }
};

const submitUserForm = async (e) => {
  e.preventDefault();

  const nameInput = document.getElementById("nameInput");
  const emailInput = document.getElementById("emailInput");
  const name = nameInput.value;
  const email = emailInput.value;

  if (!name || !email) {
    showMessage("Please fill in all fields", "error");
    return;
  }

  try {
    let response;

    if (editingUserId) {
      // Update user
      response = await fetch(`${BASE_URL}/api/users/${editingUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
    } else {
      // Create user
      response = await fetch(`${BASE_URL}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
    }

    if (!response.ok) {
      const error = await response.json();
      showMessage(error.error || "Operation failed", "error");
      return;
    }

    const message = editingUserId ? "User updated successfully" : "User created successfully";
    showMessage(message);
    resetForm();
    loadUsers();
  } catch (error) {
    console.error("Submit error:", error);
    showMessage("Error processing request", "error");
  }
};

// ==================== EVENT LISTENERS ====================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const userForm = document.getElementById("userForm");
    const cancelBtn = document.getElementById("cancelBtn");

    if (userForm) {
      userForm.addEventListener("submit", submitUserForm);
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", resetForm);
    }

    // Load initial page based on current route
    const route = window.location.pathname;
    if (route === '/' || route === '/home') {
      loadDashboard();
    } else if (route === '/users') {
      loadUsers();
    } else if (route === '/settings') {
      loadSettings();
    }
  });
} else {
  const userForm = document.getElementById("userForm");
  const cancelBtn = document.getElementById("cancelBtn");

  if (userForm) {
    userForm.addEventListener("submit", submitUserForm);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", resetForm);
  }
}

// Export functions globally for router
window.loadDashboard = loadDashboard;
window.loadUsers = loadUsers;
window.loadSettings = loadSettings;
window.editUser = editUser;
window.deleteUser = deleteUser;
