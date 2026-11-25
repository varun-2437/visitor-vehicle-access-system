package com.vvas.access

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.fragment.app.Fragment
import com.vvas.access.data.storage.SessionManager
import com.vvas.access.databinding.ActivityMainBinding
import com.vvas.access.ui.admin.AdminDashboardFragment
import com.vvas.access.ui.auth.LoginActivity
import com.vvas.access.ui.guard.GuardDashboardFragment
import com.vvas.access.ui.resident.ResidentDashboardFragment

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var sessionManager: SessionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(this)

        // Ensure user is authenticated
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
        loadRoleFragment()
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
            binding.fragmentContainer.setPadding(bars.left, 0, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    private fun setupTopBar() {
        val user = sessionManager.currentUser
        binding.tvTopUserName.text = user?.fullName ?: user?.username ?: "User"
        val roleLabel = user?.role?.uppercase() ?: "USER"
        binding.tvTopUserRole.text = "$roleLabel • v${BuildConfig.VERSION_NAME}"

        binding.btnTopLogout.setOnClickListener {
            sessionManager.clearSession()
            redirectToLogin()
        }
    }

    private fun loadRoleFragment() {
        val role = sessionManager.userRole
        val targetFragment: Fragment = when (role) {
            "admin" -> AdminDashboardFragment()
            "guard" -> GuardDashboardFragment()
            else -> ResidentDashboardFragment()
        }

        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, targetFragment)
            .commit()
    }

    private fun redirectToLogin() {
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
