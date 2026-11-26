package com.vvas.access

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.fragment.app.Fragment
import com.vvas.access.data.storage.SessionManager
import com.vvas.access.databinding.ActivityMainBinding
import com.vvas.access.ui.admin.AdminApiKeysFragment
import com.vvas.access.ui.admin.AdminDashboardFragment
import com.vvas.access.ui.admin.AdminUsersFragment
import com.vvas.access.ui.auth.LoginActivity
import com.vvas.access.ui.camera.LiveCameraStreamFragment
import com.vvas.access.ui.common.AccountProfileFragment
import com.vvas.access.ui.guard.GuardDashboardFragment
import com.vvas.access.ui.guard.GuardGateCheckFragment
import com.vvas.access.ui.resident.CreatePassBottomSheet
import com.vvas.access.ui.resident.PassDetailDialog
import com.vvas.access.ui.resident.ResidentDashboardFragment
import com.vvas.access.utils.BackendStatusMonitor
import com.vvas.access.utils.PasswordChangeDialog
import androidx.lifecycle.lifecycleScope

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var sessionManager: SessionManager
    private var backendStatusMonitor: BackendStatusMonitor? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(this)

        if (!sessionManager.isLoggedIn) {
            redirectToLogin()
            return
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        applyWindowInsets()
        setupTopBar()
        setupBottomNavigation()
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
        val initialTop = binding.topAppBar.paddingTop
        val initialLeft = binding.topAppBar.paddingLeft
        val initialRight = binding.topAppBar.paddingRight
        val initialBottom = binding.topAppBar.paddingBottom

        ViewCompat.setOnApplyWindowInsetsListener(binding.mainRoot) { _, windowInsets ->
            val bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            binding.topAppBar.setPadding(
                initialLeft + bars.left,
                initialTop + bars.top,
                initialRight + bars.right,
                initialBottom
            )
            binding.fragmentContainer.setPadding(bars.left, 0, bars.right, 0)
            binding.bottomNav.setPadding(bars.left, 0, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    private fun setupTopBar() {
        val user = sessionManager.currentUser
        binding.tvTopUserName.text = user?.fullName ?: user?.username ?: "User"
        val role = sessionManager.userRole
        val roleLabel = user?.role?.uppercase() ?: "USER"
        binding.tvTopUserRole.text = "$roleLabel • v${BuildConfig.VERSION_NAME}"

        if (role == "guard" || role == "admin") {
            binding.btnTopCamera.visibility = View.VISIBLE
            binding.btnTopCamera.setOnClickListener {
                binding.bottomNav.selectedItemId = R.id.nav_camera_feed
            }
        } else {
            binding.btnTopCamera.visibility = View.GONE
        }

        binding.btnTopPassword.setOnClickListener {
            PasswordChangeDialog.show(this, lifecycleScope)
        }

        binding.btnTopLogout.setOnClickListener {
            sessionManager.clearSession()
            redirectToLogin()
        }
    }

    private fun setupBottomNavigation() {
        val role = sessionManager.userRole
        binding.bottomNav.menu.clear()

        when (role) {
            "admin" -> {
                binding.bottomNav.inflateMenu(R.menu.bottom_nav_admin)
                replaceFragment(AdminDashboardFragment())
                binding.bottomNav.selectedItemId = R.id.nav_admin_dashboard
            }
            "guard" -> {
                binding.bottomNav.inflateMenu(R.menu.bottom_nav_guard)
                replaceFragment(GuardDashboardFragment())
                binding.bottomNav.selectedItemId = R.id.nav_guard_terminal
            }
            "camera" -> {
                binding.bottomNav.inflateMenu(R.menu.bottom_nav_camera)
                replaceFragment(LiveCameraStreamFragment())
                binding.bottomNav.selectedItemId = R.id.nav_camera_feed
            }
            else -> {
                binding.bottomNav.inflateMenu(R.menu.bottom_nav_resident)
                replaceFragment(ResidentDashboardFragment())
                binding.bottomNav.selectedItemId = R.id.nav_resident_passes
            }
        }

        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_admin_dashboard -> {
                    replaceFragment(AdminDashboardFragment())
                    true
                }
                R.id.nav_admin_users -> {
                    replaceFragment(AdminUsersFragment())
                    true
                }
                R.id.nav_admin_keys -> {
                    replaceFragment(AdminApiKeysFragment())
                    true
                }
                R.id.nav_guard_terminal -> {
                    replaceFragment(GuardDashboardFragment())
                    true
                }
                R.id.nav_guard_gate_check -> {
                    replaceFragment(GuardGateCheckFragment())
                    true
                }
                R.id.nav_resident_passes -> {
                    replaceFragment(ResidentDashboardFragment())
                    true
                }
                R.id.nav_resident_create -> {
                    val sheet = CreatePassBottomSheet { newPass ->
                        replaceFragment(ResidentDashboardFragment())
                        PassDetailDialog(this, newPass).show()
                    }
                    sheet.show(supportFragmentManager, "CreatePassBottomSheetNav")
                    false // Keep "My Passes" selected after modal opens
                }
                R.id.nav_camera_feed -> {
                    replaceFragment(LiveCameraStreamFragment())
                    true
                }
                R.id.nav_account_profile -> {
                    replaceFragment(AccountProfileFragment())
                    true
                }
                else -> false
            }
        }
    }

    private fun replaceFragment(fragment: Fragment) {
        supportFragmentManager.beginTransaction()
            .setCustomAnimations(R.anim.fade_in, R.anim.fade_out)
            .replace(R.id.fragment_container, fragment)
            .commit()
    }

    private fun redirectToLogin() {
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        @Suppress("DEPRECATION")
        overridePendingTransition(R.anim.fade_in, R.anim.fade_out)
        finish()
    }
}
