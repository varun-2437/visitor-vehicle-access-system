package com.vvas.access.ui.resident

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.vvas.access.R
import com.vvas.access.data.model.VisitorPass
import com.vvas.access.databinding.ItemVisitorPassBinding
import com.vvas.access.utils.DateTimeUtils

class PassesAdapter(
    private val onPassClick: (VisitorPass) -> Unit
) : ListAdapter<VisitorPass, PassesAdapter.PassViewHolder>(PassDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PassViewHolder {
        val binding = ItemVisitorPassBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return PassViewHolder(binding)
    }

    override fun onBindViewHolder(holder: PassViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class PassViewHolder(private val binding: ItemVisitorPassBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(pass: VisitorPass) {
            val context = binding.root.context

            binding.tvPassId.text = DateTimeUtils.formatPassId(pass.id)
            binding.tvVisitorName.text = pass.visitorName
            binding.tvPurpose.text = "Purpose: ${pass.purpose ?: "General Visit"}"

            val hostText = if (pass.resident != null) {
                "Host: ${pass.resident.fullName} (${pass.resident.flatNumber ?: "Gate"})"
            } else {
                "Host: Campus Gate"
            }
            binding.tvHostInfo.text = hostText
            binding.tvCreatedDate.text = DateTimeUtils.formatDateTime(pass.createdAt)

            // Vehicle Plate formatting
            if (!pass.vehicleNumber.isNullOrBlank()) {
                binding.layoutPlateBadge.visibility = View.VISIBLE
                binding.tvPlateNumber.text = pass.vehicleNumber.uppercase()
            } else {
                binding.layoutPlateBadge.visibility = View.GONE
            }

            // Status Badge formatting matching web dashboard colors
            when (pass.status?.lowercase() ?: "not_inside") {
                "in_campus", "used" -> {
                    binding.tvStatusBadge.text = "● IN CAMPUS"
                    binding.tvStatusBadge.setBackgroundResource(R.drawable.bg_status_in_campus)
                    binding.tvStatusBadge.setTextColor(ContextCompat.getColor(context, R.color.status_in_campus))
                }
                "not_inside", "approved", "pending" -> {
                    binding.tvStatusBadge.text = "⏳ NOT INSIDE"
                    binding.tvStatusBadge.setBackgroundResource(R.drawable.bg_status_not_inside)
                    binding.tvStatusBadge.setTextColor(ContextCompat.getColor(context, R.color.status_not_inside))
                }
                "exited" -> {
                    binding.tvStatusBadge.text = "✓ EXITED"
                    binding.tvStatusBadge.setBackgroundResource(R.drawable.bg_status_exited)
                    binding.tvStatusBadge.setTextColor(ContextCompat.getColor(context, R.color.status_exited))
                }
                else -> {
                    binding.tvStatusBadge.text = "⚠️ EXPIRED"
                    binding.tvStatusBadge.setBackgroundResource(R.drawable.bg_status_expired)
                    binding.tvStatusBadge.setTextColor(ContextCompat.getColor(context, R.color.status_expired))
                }
            }

            binding.btnViewPassQR.setOnClickListener { onPassClick(pass) }
            binding.root.setOnClickListener { onPassClick(pass) }
        }
    }

    class PassDiffCallback : DiffUtil.ItemCallback<VisitorPass>() {
        override fun areItemsTheSame(oldItem: VisitorPass, newItem: VisitorPass): Boolean =
            oldItem.id == newItem.id

        override fun areContentsTheSame(oldItem: VisitorPass, newItem: VisitorPass): Boolean =
            oldItem == newItem
    }
}
