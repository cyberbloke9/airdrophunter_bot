package com.terrem.test.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.ui.theme.*

@Composable
fun TopBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .shadow(4.dp, CircleShape)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            colors = listOf(Color(0xFFDDB892), Color(0xFFC49B6A))
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text("S", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = "👋 Hi! Sonu",
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                    color = TerremTextPrimary
                )
            }
        }

        OutlinedButton(
            onClick = { },
            shape = RoundedCornerShape(24.dp),
            border = androidx.compose.foundation.BorderStroke(1.2.dp, TerremDivider),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 9.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = TerremTextPrimary)
        ) {
            Icon(
                Icons.Outlined.AddCircleOutline,
                contentDescription = "Add",
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text("Add Assets", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
