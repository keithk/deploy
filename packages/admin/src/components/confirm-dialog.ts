// ABOUTME: Confirmation dialog component replacing browser confirm()
// ABOUTME: Modal with title, message, and confirm/cancel buttons; returns Promise<boolean>

interface ConfirmOptions {
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

class DeployConfirmDialog extends HTMLElement {
  private title: string = '';
  private message: string = '';
  private confirmText: string = 'Confirm';
  private cancelText: string = 'Cancel';
  private destructive: boolean = false;
  private resolve: ((value: boolean) => void) | null = null;

  connectedCallback() {
    this.title = this.getAttribute('dialog-title') || 'Confirm';
    this.message = this.getAttribute('message') || '';
    this.confirmText = this.getAttribute('confirm-text') || 'Confirm';
    this.cancelText = this.getAttribute('cancel-text') || 'Cancel';
    this.destructive = this.getAttribute('destructive') === 'true';
    this.render();
  }

  setResolver(resolve: (value: boolean) => void) {
    this.resolve = resolve;
  }

  private handleConfirm() {
    this.resolve?.(true);
    this.remove();
  }

  private handleCancel() {
    this.resolve?.(false);
    this.remove();
  }

  private handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.handleCancel();
    }
  };

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  render() {
    document.addEventListener('keydown', this.handleKeydown);

    const confirmBtnClass = this.destructive ? 'btn btn-danger' : 'btn btn-primary';

    this.innerHTML = `
      <div class="modal-backdrop" id="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="modal" style="max-width: 400px;">
          <div class="modal-header">
            <h2 class="modal-title" id="confirm-title">${this.escapeHtml(this.title)}</h2>
          </div>
          <div class="modal-body">
            <p>${this.escapeHtml(this.message)}</p>
          </div>
          <div class="modal-footer">
            <button class="btn" id="confirm-cancel-btn">${this.escapeHtml(this.cancelText)}</button>
            <button class="${confirmBtnClass}" id="confirm-ok-btn">${this.escapeHtml(this.confirmText)}</button>
          </div>
        </div>
      </div>
    `;

    this.querySelector('#confirm-cancel-btn')?.addEventListener('click', () => this.handleCancel());
    this.querySelector('#confirm-ok-btn')?.addEventListener('click', () => this.handleConfirm());
    this.querySelector('#confirm-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.handleCancel();
      }
    });

    // Focus the confirm button for keyboard accessibility
    (this.querySelector('#confirm-ok-btn') as HTMLElement)?.focus();
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.handleKeydown);
  }
}

customElements.define('deploy-confirm-dialog', DeployConfirmDialog);

export function showConfirm(title: string, message: string, options?: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('deploy-confirm-dialog') as DeployConfirmDialog;
    dialog.setAttribute('dialog-title', title);
    dialog.setAttribute('message', message);
    if (options?.confirmText) dialog.setAttribute('confirm-text', options.confirmText);
    if (options?.cancelText) dialog.setAttribute('cancel-text', options.cancelText);
    if (options?.destructive) dialog.setAttribute('destructive', 'true');
    dialog.setResolver(resolve);
    document.body.appendChild(dialog);
  });
}
