package com.vvas.access.ui.admin

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.vvas.access.R
import com.vvas.access.data.model.AccessLog
import com.vvas.access.databinding.ItemAccessLogBinding
import com.vvas.access.utils.DateTimeUtils

class AccessLogsAdapter :
    ListAdapter<AccessLog, AccessLogsAdapter.LogViewHolder>(LogDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): LogViewHolder {
        val binding = ItemAccessLogBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return LogViewHolder(binding)
    }

    override fun onBindViewHolder(holder: LogViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class LogViewHolder(private val binding: ItemAccessLogBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(log: AccessLog) {
            val context = binding.root.context
            val isEntry = log.action.equals("entry", ignoreCase = true)

            binding.tvLogActionBadge.text = log.action.uppercase()
            if (isEntry) {
                binding.tvLogActionBadge.setBackgroundResource(R.drawable.bg_status_in_campus)
                binding.tvLogActionBadge.setTextColor(ContextCompat.getColor(context, R.color.status_in_campus))
            } else {
                binding.tvLogActionBadge.setBackgroundResource(R.drawable.bg_status_exited)
                binding.tvLogActionBadge.setTextColor(ContextCompat.getColor(context, R.color.status_exited))
            }

            val plate = log.visitorPass?.vehicleNumber ?: "N/A"
            binding.tvLogPlate.text = plate.uppercase()

            val visitor = log.visitorPass?.visitorName ?: "Visitor"
            val flat = log.visitorPass?.resident?.flatNumber ?: "Gate"
            binding.tvLogVisitor.text = "$visitor ($flat) • ${log.visitorPass?.purpose ?: "General"}"

            binding.tvLogTime.text = DateTimeUtils.formatTimeOnly(log.timestamp)
        }
    }

    class LogDiffCallback : DiffUtil.ItemCallback<AccessLog>() {
        override fun areItemsTheSame(oldItem: AccessLog, newItem: AccessLog): Boolean =
            oldItem.id == newItem.id

        override fun areContentsTheSame(oldItem: AccessLog, newItem: AccessLog): Boolean =
            oldItem == newItem
    }
}
