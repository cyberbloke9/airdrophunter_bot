package com.terrem.test.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Villa
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material.icons.outlined.LocationCity
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun PropertyImagePlaceholder(
    gradientColors: List<Color>,
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 12.dp,
    iconSize: Dp = 40.dp,
    propertyType: String = ""
) {
    val icon = when {
        propertyType.contains("Villa", ignoreCase = true) -> Icons.Outlined.Villa
        propertyType.contains("Apartment", ignoreCase = true) -> Icons.Outlined.Apartment
        propertyType.contains("Tower", ignoreCase = true) -> Icons.Outlined.LocationCity
        else -> Icons.Outlined.Home
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(cornerRadius))
            .background(
                Brush.verticalGradient(
                    colors = gradientColors + gradientColors.map { it.copy(alpha = 0.7f) }
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        // Decorative layers for depth
        Box(
            modifier = Modifier.fillMaxSize()
        ) {
            // Subtle diagonal overlay
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.6f)
                    .fillMaxHeight()
                    .align(Alignment.CenterEnd)
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.White.copy(alpha = 0.08f)
                            )
                        )
                    )
            )
            // Bottom shadow
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.35f)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.2f)
                            )
                        )
                    )
            )
        }

        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(iconSize),
            tint = Color.White.copy(alpha = 0.35f)
        )
    }
}

@Composable
fun HeroImagePlaceholder(
    gradientColors: List<Color>,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        gradientColors.first(),
                        gradientColors.first().copy(alpha = 0.8f),
                        gradientColors.last(),
                        gradientColors.last().copy(alpha = 0.6f)
                    )
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        // Multiple decorative layers
        Box(modifier = Modifier.fillMaxSize()) {
            // Light streak
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.4f)
                    .fillMaxHeight()
                    .align(Alignment.CenterStart)
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                Color.White.copy(alpha = 0.05f),
                                Color.Transparent
                            )
                        )
                    )
            )
            // Top vignette
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.3f)
                    .align(Alignment.TopCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Black.copy(alpha = 0.3f),
                                Color.Transparent
                            )
                        )
                    )
            )
            // Bottom gradient
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.4f)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.35f)
                            )
                        )
                    )
            )
        }

        Icon(
            Icons.Outlined.Villa,
            contentDescription = null,
            modifier = Modifier.size(72.dp),
            tint = Color.White.copy(alpha = 0.2f)
        )
    }
}
