class DeployNav extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.innerHTML = `
      <nav>
        <ul style="list-style: none;">
          <li><a href="#dashboard" class="nav-link active">Dashboard</a></li>
          <li><a href="#sites" class="nav-link">Sites</a></li>
          <li><a href="#processes" class="nav-link">Processes</a></li>
          <li><a href="#actions" class="nav-link">Actions</a></li>
          <li><a href="#server" class="nav-link">Server</a></li>
        </ul>
      </nav>
      <style>
        nav ul {
          padding: 0;
        }
        
        nav li {
          margin-bottom: 0.25rem;
        }
        
        .nav-link {
          display: block;
          padding: 0.75rem 1.5rem;
          color: #374151;
          text-decoration: none;
          border-radius: 0 6px 6px 0;
          margin-right: 1rem;
          transition: all 0.2s;
        }
        
        .nav-link:hover {
          background: #f3f4f6;
          color: #2563eb;
        }
        
        .nav-link.active {
          background: #eff6ff;
          color: #2563eb;
          font-weight: 500;
        }
      </style>
    `;

    // Add click event listeners
    this.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.setActive(link);
        const section = link.getAttribute('href').substring(1);
        window.deployApp.showSection(section);
      });
    });
  }

  setActive(activeLink) {
    this.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    activeLink.classList.add('active');
  }
}

customElements.define('deploy-nav', DeployNav);