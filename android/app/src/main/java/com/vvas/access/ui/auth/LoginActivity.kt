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
        setupCreateAccountButton()
        backendStatusMonitor = BackendStatusMonitor(binding.tvBackendStatus)
        com.vvas.access.utils.AnimationUtils.animateEntrance(binding.root, delayMs = 30L, durationMs = 360L)
        com.vvas.access.utils.AnimationUtils.addPressScale(binding.btnSignIn)
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
                com.vvas.access.utils.AnimationUtils.shakeView(binding.btnSignIn)
                val errMsg = e.localizedMessage ?: "Login failed. Check server IP and credentials."
                Toast.makeText(this@LoginActivity, "Login error: $errMsg", Toast.LENGTH_LONG).show()
            } finally {
                binding.btnSignIn.isEnabled = true
                binding.progressBar.visibility = View.GONE
            }
        }
    }

    private fun setupCreateAccountButton() {
        com.vvas.access.utils.AnimationUtils.addPressScale(binding.btnCreateAccount)
        binding.btnCreateAccount.setOnClickListener {
            val container = android.widget.LinearLayout(this).apply {
                orientation = android.widget.LinearLayout.VERTICAL
                setPadding(56, 32, 56, 12)
            }

            val etFullName = android.widget.EditText(this).apply {
                hint = "Full Name *"
                inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PERSON_NAME
            }
            val etUsername = android.widget.EditText(this).apply {
                hint = "Username *"
                inputType = android.text.InputType.TYPE_CLASS_TEXT
            }
            val etEmail = android.widget.EditText(this).apply {
                hint = "Email *"
                inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            }
            val etPassword = android.widget.EditText(this).apply {
                hint = "Password (min 6 chars) *"
                inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
            val etFlat = android.widget.EditText(this).apply {
                hint = "Flat / Unit Number (e.g. A-204)"
                inputType = android.text.InputType.TYPE_CLASS_TEXT
            }

            val roleLabel = android.widget.TextView(this).apply {
                text = "Account Role:"
                textSize = 13f
                setPadding(0, 16, 0, 4)
            }
            val rgRole = android.widget.RadioGroup(this).apply {
                orientation = android.widget.RadioGroup.VERTICAL
            }
            val rbResident = android.widget.RadioButton(this).apply {
                text = "Resident (Instant Access)"
                isChecked = true
            }
            val rbGuard = android.widget.RadioButton(this).apply {
                text = "Guard (Requires Admin Approval)"
            }
            rgRole.addView(rbResident)
            rgRole.addView(rbGuard)

            rgRole.setOnCheckedChangeListener { _, checkedId ->
                etFlat.visibility = if (checkedId == rbGuard.id) View.GONE else View.VISIBLE
            }

            container.addView(etFullName)
            container.addView(etUsername)
            container.addView(etEmail)
            container.addView(etPassword)
            container.addView(roleLabel)
            container.addView(rgRole)
            container.addView(etFlat)

            com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle("Create New Account")
                .setView(container)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Create Account") { _, _ ->
                    val fullName = etFullName.text.toString().trim()
                    val username = etUsername.text.toString().trim()
                    val email = etEmail.text.toString().trim()
                    val password = etPassword.text.toString()
                    val role = if (rbGuard.isChecked) "guard" else "resident"
                    val flat = etFlat.text.toString().trim().ifEmpty { null }

                    if (fullName.isEmpty() || username.isEmpty() || email.isEmpty() || password.length < 6) {
                        Toast.makeText(
                            this,
                            "Please fill all required fields (password min 6 chars)",
                            Toast.LENGTH_LONG
                        ).show()
                        return@setPositiveButton
                    }

                    lifecycleScope.launch {
                        try {
                            ApiClient.getService(this@LoginActivity).register(
                                com.vvas.access.data.model.RegisterRequest(
                                    username = username,
                                    email = email,
                                    password = password,
                                    fullName = fullName,
                                    role = role,
                                    flatNumber = if (role == "resident") flat else null
                                )
                            )
                            binding.etUsername.setText(username)
                            val msg = if (role == "guard") {
                                "Guard account submitted! An Admin must approve your account before you can sign in."
                            } else {
                                "Resident account created! You can now sign in."
                            }
                            com.google.android.material.dialog.MaterialAlertDialogBuilder(this@LoginActivity)
                                .setTitle("Account Created")
                                .setMessage(msg)
                                .setPositiveButton("OK", null)
                                .show()
                        } catch (e: Exception) {
                            Toast.makeText(
                                this@LoginActivity,
                                "Signup failed: ${e.localizedMessage ?: "Check details"}",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                }
                .show()
        }
    }

    private fun navigateToMain() {
        val intent = Intent(this, MainActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        @Suppress("DEPRECATION")
        overridePendingTransition(com.vvas.access.R.anim.fade_slide_up, com.vvas.access.R.anim.fade_out)
        finish()
    }
}
