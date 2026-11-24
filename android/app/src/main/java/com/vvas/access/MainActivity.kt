package com.vvas.access

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
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

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupTopBar()
        loadRoleFragment()
    }

    private fun setupTopBar() {
        val user = sessionManager.currentUser
        binding.tvTopUserName.text = user?.fullName ?: user?.username ?: "User"
        binding.tvTopUserRole.text = user?.role?.uppercase() ?: "USER"

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
