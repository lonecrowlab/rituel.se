// Updated by Elevate: 2026-01-02T23:26:05.706Z
class PasswordModal extends DetailsModal {
  constructor() {
    super();

    if (this.querySelector('input[aria-invalid="true"]')) this.open({target: this.querySelector('details')});
  }
}

customElements.define('password-modal', PasswordModal);
