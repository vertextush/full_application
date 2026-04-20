/**
 * Determines which microservice URL to use based on the API endpoint
 * Supports multiple deployment patterns:
 * - Kubernetes: Uses k8s service names (service.namespace.svc.cluster.local)
 * - Docker: Uses docker-compose service names
 * - Ingress: Uses ingress URLs with path routing
 * - Localhost: Uses localhost:PORT for development
 * - Direct URLs: Uses any provided full URL
 */
const getServiceBaseUrl = (endpoint) => {
  if (window.APP_CONFIG && window.APP_CONFIG.API_PROXY_ENABLED) {
    return "";
  }

  if (!window.APP_CONFIG || !window.APP_CONFIG.MICROSERVICES) {
    // Browser-safe fallback: call same-origin so reverse proxy can route requests.
    return "";
  }

  const { MICROSERVICES } = window.APP_CONFIG;

  // Route to appropriate service based on endpoint
  if (endpoint.includes("/users")) {
    return MICROSERVICES.userService;
  } else if (endpoint.includes("/dashboard")) {
    return MICROSERVICES.dashboardService;
  } else if (endpoint.includes("/settings")) {
    return MICROSERVICES.settingsService;
  }

  // Default fallback
  return MICROSERVICES.userService;
};

let editingUserId = null;

const setReleaseValue = (elementId, value) => {
  const target = document.getElementById(elementId);
  if (target) {
    target.textContent = value;
  }
};

const getFrontendReleaseTag = () => {
  return window.APP_CONFIG?.FRONTEND_RELEASE_TAG || "v2";
};

const loadReleaseRouting = async () => {
  setReleaseValue("frontendRelease", getFrontendReleaseTag());

  try {
    const usersBaseUrl = getServiceBaseUrl("/api/users");
    const usersResponse = await fetch(`${usersBaseUrl}/api/users?includeMeta=true`);
    const usersPayload = await usersResponse.json();
    setReleaseValue(
      "userServiceRelease",
      usersPayload?.meta?.releaseTag || usersResponse.headers.get("x-release-tag") || "unknown"
    );
  } catch (error) {
    setReleaseValue("userServiceRelease", "unavailable");
  }

  try {
    const dashboardBaseUrl = getServiceBaseUrl("/api/dashboard");
    const dashboardResponse = await fetch(`${dashboardBaseUrl}/api/dashboard`);
    const dashboardPayload = await dashboardResponse.json();
    const dashboardTag =
      dashboardPayload?.releaseTag ||
      dashboardResponse.headers.get("x-release-tag") ||
      "unknown";
    const trafficSignature = dashboardPayload?.trafficSignature || "n/a";
    setReleaseValue("dashboardServiceRelease", `${dashboardTag} (${trafficSignature})`);
  } catch (error) {
    setReleaseValue("dashboardServiceRelease", "unavailable");
  }

  try {
    const settingsBaseUrl = getServiceBaseUrl("/api/settings");
    const settingsResponse = await fetch(`${settingsBaseUrl}/api/settings`);
    const settingsPayload = await settingsResponse.json();
    setReleaseValue(
      "settingsServiceRelease",
      settingsPayload?.releaseTag || settingsResponse.headers.get("x-release-tag") || "unknown"
    );
  } catch (error) {
    setReleaseValue("settingsServiceRelease", "unavailable");
  }
};

const setFrontendReleaseBanner = () => {
  const banner = document.getElementById("releaseBanner");
  if (banner) {
    banner.textContent = `Frontend Release: ${getFrontendReleaseTag()}`;
  }
};

// ==================== DASHBOARD PAGE ====================
const loadDashboard = async () => {
  setFrontendReleaseBanner();
  loadReleaseRouting();

  try {
    const baseUrl = getServiceBaseUrl("/api/dashboard");
    const response = await fetch(`${baseUrl}/api/dashboard`);
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
  setFrontendReleaseBanner();
  loadReleaseRouting();

  try {
    const baseUrl = getServiceBaseUrl("/api/users");
    const response = await fetch(`${baseUrl}/api/users`);

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
  setFrontendReleaseBanner();
  loadReleaseRouting();

  try {
    const baseUrl = getServiceBaseUrl("/api/settings");
    const response = await fetch(`${baseUrl}/api/settings`);
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
    const baseUrl = getServiceBaseUrl("/api/users");
    const response = await fetch(`${baseUrl}/api/users/${id}`, {
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
    const baseUrl = getServiceBaseUrl("/api/users");
    let response;

    if (editingUserId) {
      // Update user
      response = await fetch(`${baseUrl}/api/users/${editingUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
    } else {
      // Create user
      response = await fetch(`${baseUrl}/api/users`, {
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

    setFrontendReleaseBanner();
    loadReleaseRouting();

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

  setFrontendReleaseBanner();
  loadReleaseRouting();
}

// Export functions globally for router
window.loadDashboard = loadDashboard;
window.loadUsers = loadUsers;
window.loadSettings = loadSettings;
window.editUser = editUser;
window.deleteUser = deleteUser;
