// ABOUTME: Input dialog component replacing browser prompt()
// ABOUTME: Modal with text input, title, and submit/cancel buttons; returns Promise<string|null>

interface InputOptions {
  placeholder?: string;
  initialValue?: string;
  submitText?: string;
  cancelText?: string;
}

class DeployInputDialog extends HTMLElement {
  private title: string = '';
  private placeholder: string = '';
  private initialValue: string = '';
  private submitText: string = 'OK';
  private cancelText: string = 'Cancel';
  private resolve: ((value: string | null) => void) | null = null;

  connectedCallback() {
    this.title = this.getAttribute('dialog-title') || 'Input';
    this.placeholder = this.getAttribute('placeholder') || '';
    this.initialValue = this.getAttribute('initial-value') || '';
    this.submitText = this.getAttribute('submit-text') || 'OK';
    this.cancelText = this.getAttribute('cancel-text') || 'Cancel';
    this.render();
  }

  setResolver(resolve: (value: string | null) => void) {
    this.resolve = resolve;
  }

  private handleSubmit() {
    const input = this.querySelector('#input-field') as HTMLInputElement;
    this.resolve?.(input?.value ?? null);
    this.remove();
  }

  private handleCancel() {
    this.resolve?.(null);
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

    this.innerHTML = `
      <div class="modal-backdrop" id="input-overlay" role="dialog" aria-modal="true" aria-labelledby="input-title">
        <div class="modal" style="max-width: 400px;">
          <div class="modal-header">
            <h2 class="modal-title" id="input-title">${this.escapeHtml(this.title)}</h2>
          </div>
          <form id="input-form">
            <div class="modal-body">
              <input
                type="text"
                id="input-field"
                class="form-input"
                placeholder="${this.escapeHtml(this.placeholder)}"
                value="${this.escapeHtml(this.initialValue)}"
              />
            </div>
            <div class="modal-footer">
              <button type="button" class="btn" id="input-cancel-btn">${this.escapeHtml(this.cancelText)}</button>
              <button type="submit" class="btn btn-primary" id="input-submit-btn">${this.escapeHtml(this.submitText)}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.querySelector('#input-cancel-btn')?.addEventListener('click', () => this.handleCancel());
    this.querySelector('#input-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
    this.querySelector('#input-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.handleCancel();
      }
    });

    // Focus the input field
    (this.querySelector('#input-field') as HTMLElement)?.focus();
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.handleKeydown);
  }
}

customElements.define('deploy-input-dialog', DeployInputDialog);

export function showInput(title: string, options?: InputOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('deploy-input-dialog') as DeployInputDialog;
    dialog.setAttribute('dialog-title', title);
    if (options?.placeholder) dialog.setAttribute('placeholder', options.placeholder);
    if (options?.initialValue) dialog.setAttribute('initial-value', options.initialValue);
    if (options?.submitText) dialog.setAttribute('submit-text', options.submitText);
    if (options?.cancelText) dialog.setAttribute('cancel-text', options.cancelText);
    dialog.setResolver(resolve);
    document.body.appendChild(dialog);
  });
}
