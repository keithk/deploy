// ABOUTME: Toast notification component for non-blocking user feedback
// ABOUTME: Replaces alert() calls with auto-dismissing toast messages

type ToastType = 'success' | 'error' | 'info';

class DeployToast extends HTMLElement {
  private message: string = '';
  private type: ToastType = 'info';
  private duration: number = 4000;
  private dismissTimer: number | null = null;

  connectedCallback() {
    this.message = this.getAttribute('message') || '';
    this.type = (this.getAttribute('type') as ToastType) || 'info';
    this.duration = parseInt(this.getAttribute('duration') || '4000', 10);
    this.render();

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => {
      this.querySelector('.toast')?.classList.add('toast-visible');
    });

    this.dismissTimer = window.setTimeout(() => this.dismiss(), this.duration);
  }

  disconnectedCallback() {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
  }

  dismiss() {
    const el = this.querySelector('.toast');
    if (el) {
      el.classList.remove('toast-visible');
      el.addEventListener('transitionend', () => this.remove(), { once: true });
    } else {
      this.remove();
    }
  }

  render() {
    const borderColor =
      this.type === 'error' ? 'var(--status-error)' :
      this.type === 'success' ? 'var(--status-running)' :
      'var(--accent)';

    const textColor =
      this.type === 'error' ? 'var(--status-error)' :
      this.type === 'success' ? 'var(--status-running)' :
      'var(--text)';

    this.innerHTML = `
      <div class="toast" role="status" aria-live="polite">
        <span class="toast-message">${this.escapeHtml(this.message)}</span>
        <button class="toast-close" aria-label="Dismiss">&times;</button>
      </div>
      <style>
        .toast {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          background: var(--bg);
          border: 1px solid ${borderColor};
          border-left: 3px solid ${borderColor};
          color: ${textColor};
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          max-width: 420px;
          opacity: 0;
          transform: translateX(100%);
          transition: opacity 0.2s ease, transform 0.2s ease;
          pointer-events: auto;
        }
        .toast-visible {
          opacity: 1;
          transform: translateX(0);
        }
        .toast-message {
          flex: 1;
          word-break: break-word;
        }
        .toast-close {
          border: none;
          background: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: var(--text-lg);
          padding: 0;
          line-height: 1;
        }
        .toast-close:hover {
          color: var(--text);
        }
      </style>
    `;

    this.querySelector('.toast-close')?.addEventListener('click', () => this.dismiss());
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('deploy-toast', DeployToast);

// Container for stacking toasts
function getToastContainer(): HTMLElement {
  let container = document.getElementById('deploy-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'deploy-toast-container';
    container.style.cssText = `
      position: fixed;
      top: var(--space-5, 24px);
      right: var(--space-5, 24px);
      z-index: 300;
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, type: ToastType = 'info', duration?: number): void {
  const toast = document.createElement('deploy-toast');
  toast.setAttribute('message', message);
  toast.setAttribute('type', type);
  if (duration) {
    toast.setAttribute('duration', String(duration));
  }
  getToastContainer().appendChild(toast);
}
