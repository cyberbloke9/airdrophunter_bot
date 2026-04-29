package com.terrem.test.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun ShimmerEffect(
    modifier: Modifier = Modifier,
    widthDp: Dp = 200.dp,
    heightDp: Dp = 20.dp,
    cornerRadius: Dp = 8.dp
) {
    val shimmerColors = listOf(
        Color(0xFFE0E0E0),
        Color(0xFFF5F5F5),
        Color(0xFFE0E0E0),
    )

    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateAnim = transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer_translate"
    )

    val brush = Brush.linearGradient(
        colors = shimmerColors,
        start = Offset(translateAnim.value - 200f, 0f),
        end = Offset(translateAnim.value, 0f)
    )

    Box(
        modifier = modifier
            .size(widthDp, heightDp)
            .clip(RoundedCornerShape(cornerRadius))
            .background(brush)
    )
}

@Composable
fun PropertyCardShimmer(modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(16.dp)) {
        ShimmerEffect(widthDp = 340.dp, heightDp = 180.dp, cornerRadius = 16.dp)
        Spacer(modifier = Modifier.height(12.dp))
        ShimmerEffect(widthDp = 200.dp, heightDp = 18.dp)
        Spacer(modifier = Modifier.height(8.dp))
        ShimmerEffect(widthDp = 120.dp, heightDp = 22.dp)
        Spacer(modifier = Modifier.height(8.dp))
        ShimmerEffect(widthDp = 250.dp, heightDp = 14.dp)
    }
}
