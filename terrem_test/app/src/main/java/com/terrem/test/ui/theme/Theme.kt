package com.terrem.test.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
    primary = TerremPrimary,
    onPrimary = Color.White,
    primaryContainer = TerremTeal,
    secondary = TerremGold,
    onSecondary = Color.White,
    background = TerremBackground,
    surface = TerremSurface,
    onBackground = TerremTextPrimary,
    onSurface = TerremTextPrimary,
    outline = TerremDivider,
)

@Composable
fun TerremTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        content = content
    )
}
