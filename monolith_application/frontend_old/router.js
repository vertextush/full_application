class Router {
  constructor() {
    this.currentRoute = '/';
    this.routes = {
      '/': 'home-page',
      '/users': 'users-page',
      '/settings': 'settings-page',
    };
    this.setupRouterLinks();
    this.setupPopstate();
    this.navigate(window.location.pathname);
  }

  setupRouterLinks() {
    document.querySelectorAll('[data-route]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = e.currentTarget.getAttribute('data-route');
        this.navigate('/' + (route === 'home' ? '' : route));
      });
    });
  }

  setupPopstate() {
    window.addEventListener('popstate', (e) => {
      this.navigate(window.location.pathname);
    });
  }

  navigate(path) {
    // Normalize path
    const route = path === '/home' ? '/' : path || '/';
    
    if (!this.routes[route]) {
      this.navigate('/');
      return;
    }

    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });

    // Show target page
    const pageId = this.routes[route];
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      targetPage.classList.add('active');
    }

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    
    const activeLink = document.querySelector(`[data-route="${route === '/' ? 'home' : route.substring(1)}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }

    // Update browser history
    if (window.location.pathname !== route) {
      window.history.pushState({ route }, '', route);
    }

    this.currentRoute = route;

    // Trigger page load callbacks
    if (route === '/' && window.loadDashboard) {
      window.loadDashboard();
    } else if (route === '/users' && window.loadUsers) {
      window.loadUsers();
    } else if (route === '/settings' && window.loadSettings) {
      window.loadSettings();
    }
  }
}

// Initialize router when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.router = new Router();
  });
} else {
  window.router = new Router();
}
