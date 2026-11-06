(() => {
  const client = window.jeazySupabase;
  const requestForm = document.querySelector('#recoveryRequestForm');
  const newPasswordForm = document.querySelector('#newPasswordForm');

  const setMessage = (element, text, type = '') => {
    if (!element) return;
    element.textContent = text;
    element.className = `form-message ${type}`.trim();
  };

  if (requestForm) {
    requestForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.querySelector('#recoveryRequestMessage');
      const button = requestForm.querySelector('button[type="submit"]');
      const email = document.querySelector('#recoveryEmail').value.trim().toLowerCase();

      if (!client) {
        setMessage(message, 'No fue posible conectar con el servicio. Intenta nuevamente.', 'error');
        return;
      }

      button.disabled = true;
      button.textContent = 'Enviando…';
      const redirectTo = `${window.location.origin}/nueva-contrasena/`;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      button.disabled = false;
      button.textContent = 'Enviar enlace de recuperación';

      if (error) {
        const isRateLimit = error.status === 429
          || error.code === 'over_email_send_rate_limit'
          || /rate limit/i.test(error.message || '');
        setMessage(message, isRateLimit
          ? 'Se alcanzó temporalmente el límite de correos de recuperación. Espera unos minutos antes de intentarlo nuevamente.'
          : 'No fue posible enviar el enlace. Intenta nuevamente.', 'error');
        return;
      }

      setMessage(message, 'Si existe una cuenta con ese correo, recibirás un enlace para crear tu contraseña nueva. Revisa también la carpeta de spam.', 'success');
      requestForm.reset();
    });
  }

  if (newPasswordForm) {
    const message = document.querySelector('#newPasswordMessage');
    const password = document.querySelector('#newPassword');
    const confirmation = document.querySelector('#confirmNewPassword');
    const button = newPasswordForm.querySelector('button[type="submit"]');
    const enableForm = () => {
      password.disabled = false;
      confirmation.disabled = false;
      button.disabled = false;
      newPasswordForm.setAttribute('aria-busy', 'false');
      setMessage(message, 'Enlace validado. Escribe y confirma tu contraseña nueva.', 'success');
    };

    if (!client) {
      setMessage(message, 'No fue posible conectar con el servicio. Solicita otro enlace.', 'error');
    } else {
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY' || session?.user) enableForm();
      });

      client.auth.getSession().then(({ data, error }) => {
        if (!error && data.session?.user) enableForm();
        else if (!window.location.hash && !new URLSearchParams(window.location.search).has('code')) {
          setMessage(message, 'Este enlace no es válido o ya expiró. Solicita uno nuevo.', 'error');
        }
      });
    }

    newPasswordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (password.value.length < 8) {
        setMessage(message, 'La contraseña debe tener al menos 8 caracteres.', 'error');
        return;
      }
      if (password.value !== confirmation.value) {
        setMessage(message, 'Las contraseñas no coinciden.', 'error');
        return;
      }

      button.disabled = true;
      button.textContent = 'Guardando…';
      const { error } = await client.auth.updateUser({ password: password.value });
      if (error) {
        button.disabled = false;
        button.textContent = 'Guardar contraseña nueva';
        setMessage(message, 'No fue posible actualizar la contraseña. Solicita un enlace nuevo.', 'error');
        return;
      }

      await client.auth.signOut();
      setMessage(message, 'Tu contraseña fue actualizada. Ahora puedes ingresar con tu correo.', 'success');
      button.textContent = 'Contraseña actualizada';
      setTimeout(() => window.location.replace('../acceso/'), 1400);
    });
  }
})();
