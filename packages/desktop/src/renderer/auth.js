// State
    let isLoginMode = true;
    let isLoading = false;

    // Elements
    const form = document.getElementById('authForm');
    const nameField = document.getElementById('nameField');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.getElementById('submitBtn');
    const submitText = document.getElementById('submitText');
    const errorMessage = document.getElementById('errorMessage');
    const welcomeText = document.getElementById('welcomeText');
    const modeToggleText = document.getElementById('modeToggleText');
    const modeToggleLink = document.getElementById('modeToggleLink');
    const passwordToggle = document.getElementById('passwordToggle');
    const forgotPassword = document.getElementById('forgotPassword');
    const passwordStrength = document.getElementById('passwordStrength');
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');

    // Auto-focus email on load
    window.addEventListener('DOMContentLoaded', () => {
      emailInput.focus();
    });

    // Password toggle
    passwordToggle.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      passwordToggle.textContent = type === 'password' ? '👁️' : '🙈';
    });

    // Password strength indicator
    passwordInput.addEventListener('input', () => {
      if (!isLoginMode) {
        const password = passwordInput.value;
        const strength = calculatePasswordStrength(password);
        
        passwordStrength.classList.add('show');
        strengthFill.className = 'strength-fill ' + strength.level;
        strengthText.className = 'strength-text ' + strength.level;
        strengthText.textContent = strength.text;
      }
    });

    function calculatePasswordStrength(password) {
      if (password.length === 0) {
        return { level: '', text: 'Enter a password' };
      }
      if (password.length < 8) {
        return { level: 'weak', text: 'Weak - At least 8 characters' };
      }
      
      let score = 0;
      if (password.length >= 12) score++;
      if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
      if (/\d/.test(password)) score++;
      if (/[^a-zA-Z\d]/.test(password)) score++;
      
      if (score <= 1) return { level: 'weak', text: 'Weak password' };
      if (score <= 2) return { level: 'medium', text: 'Medium password' };
      return { level: 'strong', text: 'Strong password' };
    }

    // Mode toggle
    modeToggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      toggleMode();
    });

    function toggleMode() {
      isLoginMode = !isLoginMode;
      
      if (isLoginMode) {
        // Switch to login mode
        welcomeText.textContent = 'Welcome back';
        submitText.textContent = 'Sign In';
        modeToggleText.textContent = "Don't have an account?";
        modeToggleLink.textContent = 'Create Account';
        nameField.classList.remove('show');
        passwordStrength.classList.remove('show');
        forgotPassword.style.display = 'block';
        nameInput.removeAttribute('required');
      } else {
        // Switch to register mode
        welcomeText.textContent = 'Create your account';
        submitText.textContent = 'Create Account';
        modeToggleText.textContent = 'Already have an account?';
        modeToggleLink.textContent = 'Sign In';
        nameField.classList.add('show');
        forgotPassword.style.display = 'none';
        nameInput.setAttribute('required', '');
      }
      
      // Clear form and errors
      clearError();
      form.reset();
      emailInput.focus();
    }

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (isLoading) return;
      
      // Validate inputs
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const name = nameInput.value.trim();
      
      if (!validateEmail(email)) {
        showError('Please enter a valid email address');
        emailInput.classList.add('error');
        return;
      }
      
      if (password.length < 8) {
        showError('Password must be at least 8 characters');
        passwordInput.classList.add('error');
        return;
      }
      
      if (!isLoginMode && name.length < 2) {
        showError('Please enter your name (at least 2 characters)');
        nameInput.classList.add('error');
        return;
      }
      
      // Clear errors
      clearError();
      
      // Show loading state
      setLoading(true);
      
      try {
        let result;
        
        if (isLoginMode) {
          // Login
          result = await window.fp.auth.login(email, password);
        } else {
          // Register
          result = await window.fp.auth.register(name, email, password);
        }
        
        if (result.success) {
          // Show success message
          const userName = result.user?.displayName || result.user?.name || 'there';
          showSuccess(isLoginMode ? `Welcome back, ${userName}!` : `Welcome to FocusPal, ${userName}!`);
          
          // Wait a moment then notify main process
          setTimeout(() => {
            // Main process will close auth window and show widget
            window.close();
          }, 1000);
        } else {
          showError(result.error || 'Authentication failed. Please try again.');
        }
      } catch (error) {
        console.error('Auth error:', error);
        showError(error.message || 'Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    });

    function validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function setLoading(loading) {
      isLoading = loading;
      submitBtn.disabled = loading;
      submitBtn.classList.toggle('loading', loading);
      
      if (loading) {
        submitText.textContent = isLoginMode ? 'Signing in...' : 'Creating account...';
      } else {
        submitText.textContent = isLoginMode ? 'Sign In' : 'Create Account';
      }
    }

    function showError(message) {
      errorMessage.textContent = message;
      errorMessage.classList.add('show');
    }

    function showSuccess(message) {
      errorMessage.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
      errorMessage.style.borderColor = 'var(--success)';
      errorMessage.style.color = 'var(--success)';
      errorMessage.textContent = message;
      errorMessage.classList.add('show');
    }

    function clearError() {
      errorMessage.classList.remove('show');
      errorMessage.style.backgroundColor = '';
      errorMessage.style.borderColor = '';
      errorMessage.style.color = '';
      emailInput.classList.remove('error');
      passwordInput.classList.remove('error');
      nameInput.classList.remove('error');
    }

    forgotPassword.addEventListener('click', async (e) => {
      e.preventDefault();

      const email = emailInput.value.trim();
      if (!validateEmail(email)) {
        showError('Enter your email first to request a reset link');
        emailInput.classList.add('error');
        emailInput.focus();
        return;
      }

      try {
        const result = await window.fp.auth.requestPasswordReset(email);
        if (result.success) {
          showSuccess(result.message || 'If the account exists, a reset link has been sent.');
        } else {
          showError(result.error || 'Unable to request password reset.');
        }
      } catch (error) {
        console.error('Forgot password error:', error);
        showError('Unable to request password reset.');
      }
    });

    // Clear error on input
    [emailInput, passwordInput, nameInput].forEach(input => {
      input.addEventListener('input', () => {
        input.classList.remove('error');
        if (errorMessage.classList.contains('show')) {
          clearError();
        }
      });
    });

    // Window controls
    document.getElementById('btn-minimize').addEventListener('click', () => {
      window.fp.minimizeWindow();
    });

    document.getElementById('btn-close').addEventListener('click', () => {
      window.fp.closeWindow();
    });
