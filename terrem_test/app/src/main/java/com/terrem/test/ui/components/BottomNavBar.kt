package com.terrem.test.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.ui.theme.*

data class BottomNavItem(
    val label: String,
    val icon: ImageVector,
    val route: String,
    val hasBadge: Boolean = false
)

val bottomNavItems = listOf(
    BottomNavItem("Home", Icons.Filled.Home, "home"),
    BottomNavItem("Activity", Icons.Outlined.Description, "activity"),
    BottomNavItem("", Icons.Outlined.GridView, "center"),
    BottomNavItem("Portfolio", Icons.Outlined.TrendingUp, "portfolio"),
    BottomNavItem("Alerts", Icons.Outlined.Notifications, "alerts", hasBadge = true),
)

@Composable
fun TerremBottomBar(
    currentRoute: String,
    onNavigate: (String) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shadowElevation = 12.dp,
        color = Color.White
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .height(68.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            bottomNavItems.forEach { item ->
                if (item.route == "center") {
                    // Center FAB
                    Box(
                        modifier = Modifier
                            .offset(y = (-14).dp)
                            .size(56.dp)
                            .shadow(8.dp, CircleShape)
                            .clip(CircleShape)
                            .background(TerremPrimary)
                            .clickable { },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            item.icon,
                            contentDescription = "Menu",
                            tint = Color.White,
                            modifier = Modifier.size(26.dp)
                        )
                    }
                } else {
                    val isSelected = currentRoute == item.route
                    val scale by animateFloatAsState(
                        targetValue = if (isSelected) 1.1f else 1f,
                        animationSpec = spring(stiffness = Spring.StiffnessHigh),
                        label = "nav_scale"
                    )
                    val color by animateColorAsState(
                        targetValue = if (isSelected) TerremPrimary else TerremTextTertiary,
                        animationSpec = tween(200),
                        label = "nav_color"
                    )

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(
                                indication = null,
                                interactionSource = remember { MutableInteractionSource() }
                            ) { onNavigate(item.route) }
                            .scale(scale),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box {
                            Icon(
                                item.icon,
                                contentDescription = item.label,
                                tint = color,
                                modifier = Modifier.size(24.dp)
                            )
                            if (item.hasBadge) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .offset(x = 4.dp, y = (-2).dp)
                                        .size(9.dp)
                                        .clip(CircleShape)
                                        .background(TerremHotRed)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            item.label,
                            fontSize = 11.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            color = color
                        )
                    }
                }
            }
        }
    }
}
