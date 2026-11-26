package com.vvas.access.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import com.vvas.access.BuildConfig
import com.vvas.access.MainActivity
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.LoginRequest
import com.vvas.access.data.storage.SessionManager
import com.vvas.access.databinding.ActivityLoginBinding
import com.vvas.access.utils.BackendStatusMonitor
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var sessionManager: SessionManager
    private var backendStatusMonitor: BackendStatusMonitor? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(this)

        // If already logged in, skip directly to MainActivity
        if (sessionManager.isLoggedIn) {
            navigateToMain()
            return
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        applyWindowInsets()
        binding.tvAppVersion.text =
            "VVAS Mobile v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE})"
        setupServerConfig()
        setupQuickFillButtons()
        setupLoginButton()
        backendStatusMonitor = BackendStatusMonitor(binding.tvBackendStatus)
    }

    override fun onResume() {
        super.onResume()
        backendStatusMonitor?.start()
    }

    override fun onPause() {
        super.onPause()
        backendStatusMonitor?.stop()
    }

    private fun applyWindowInsets() {
        val initialHeroTop = binding.heroHeader.paddingTop
        val initialRootBottom = binding.loginRoot.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(binding.loginRoot) { _, windowInsets ->
            val bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            binding.heroHeader.setPadding(
                binding.heroHeader.paddingLeft,
                initialHeroTop + bars.top,
                binding.heroHeader.paddingRight,
                binding.heroHeader.paddingBottom
            )
            binding.loginRoot.setPadding(bars.left, 0, bars.right, initialRootBottom + bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    private fun setupServerConfig() {
        binding.etServerUrl.setText(sessionManager.serverUrl)

        binding.tvToggleServerSettings.setOnClickListener {
            val isVisible = binding.layoutServerSettings.visibility == View.VISIBLE
            binding.layoutServerSettings.visibility = if (isVisible) View.GONE else View.VISIBLE
        }

        binding.btnSaveServerUrl.setOnClickListener {
            val url = binding.etServerUrl.text.toString().trim()
            if (url.isNotEmpty()) {
                sessionManager.serverUrl = url
                ApiClient.resetClient()
                Toast.makeText(this, "API Server URL updated!", Toast.LENGTH_SHORT).show()
                binding.layoutServerSettings.visibility = View.GONE
            }
        }
    }

    private fun setupQuickFillButtons() {
        binding.btnQuickResident.setOnClickListener {
            binding.etUsername.setText("varun")
            binding.etPassword.setText("pass123")
        }
        binding.btnQuickGuard.setOnClickListener {
            binding.etUsername.setText("guard1")
            binding.etPassword.setText("pass123")
        }
        binding.btnQuickAdmin.setOnClickListener {
            binding.etUsername.setText("admin")
            binding.etPassword.setText("admin123")
        }
        binding.btnQuickCamera.setOnClickListener {
            binding.etUsername.setText("gatecam")
            binding.etPassword.setText("gatecam123")
        }
    }

    private fun setupLoginButton() {
        binding.btnSignIn.setOnClickListener {
            val username = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString().trim()

            if (username.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "Please enter both username and password", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            performLogin(username, password)
        }
    }

    private fun performLogin(username: String, password: String) {
        binding.btnSignIn.isEnabled = false
        binding.progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val api = ApiClient.getService(this@LoginActivity)
                val tokenResponse = api.login(LoginRequest(username, password))

                // Save access token
                sessionManager.authToken = tokenResponse.accessToken

                // Fetch full user profile
                val userProfile = api.getProfile()
                sessionManager.currentUser = userProfile

                Toast.makeText(
                    this@LoginActivity,
                    "Welcome, ${userProfile.fullName} (${userProfile.role.uppercase()})",
                    Toast.LENGTH_SHORT
                ).show()

                navigateToMain()
            } catch (e: Exception) {
                val errMsg = e.localizedMessage ?: "Login failed. Check server IP and credentials."
                Toast.makeText(this@LoginActivity, "Login error: $errMsg", Toast.LENGTH_LONG).show()
            } finally {
                binding.btnSignIn.isEnabled = true
                binding.progressBar.visibility = View.GONE
            }
        }
    }

    private fun navigateToMain() {
        val intent = Intent(this, MainActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
