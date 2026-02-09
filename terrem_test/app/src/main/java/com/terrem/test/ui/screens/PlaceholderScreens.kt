package com.terrem.test.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.ui.theme.*

@Composable
fun ActivityScreen() {
    PlaceholderContent(
        icon = Icons.Outlined.Description,
        title = "Activity",
        subtitle = "Your recent property activities will appear here"
    )
}

@Composable
fun PortfolioScreen() {
    PlaceholderContent(
        icon = Icons.Outlined.TrendingUp,
        title = "Portfolio",
        subtitle = "Track your property investments and returns"
    )
}

@Composable
fun AlertsScreen() {
    PlaceholderContent(
        icon = Icons.Outlined.Notifications,
        title = "Alerts",
        subtitle = "Stay updated with property alerts and notifications"
    )
}

@Composable
private fun PlaceholderContent(icon: ImageVector, title: String, subtitle: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(TerremBackground),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                icon,
                contentDescription = title,
                modifier = Modifier.size(64.dp),
                tint = TerremTextTertiary
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                title,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = TerremTextPrimary
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                subtitle,
                fontSize = 14.sp,
                color = TerremTextSecondary
            )
        }
    }
}
