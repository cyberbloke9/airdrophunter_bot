package com.terrem.test.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.Factory
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.ui.theme.*

@Composable
fun DiscoverSection() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = buildAnnotatedString {
                append("Discover Your Next\nProperties In ")
                withStyle(style = SpanStyle(color = TerremTeal)) {
                    append("Your City")
                }
            },
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            lineHeight = 32.sp,
            color = TerremTextPrimary
        )

        Spacer(modifier = Modifier.height(12.dp))

        // City selector
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable { }
        ) {
            Icon(
                Icons.Default.LocationOn,
                contentDescription = "Location",
                tint = TerremTextSecondary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                "Hyderabad",
                fontSize = 16.sp,
                color = TerremTextSecondary,
                fontWeight = FontWeight.Medium
            )
            Icon(
                Icons.Default.KeyboardArrowDown,
                contentDescription = "Dropdown",
                tint = TerremTextSecondary,
                modifier = Modifier.size(20.dp)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Fractional / Non-Fractional toggle
        FractionalToggle()

        Spacer(modifier = Modifier.height(16.dp))

        // Search bar
        SearchBar()

        Spacer(modifier = Modifier.height(12.dp))

        // Category chips
        CategoryChips()
    }
}

@Composable
fun FractionalToggle() {
    var selectedIndex by remember { mutableIntStateOf(0) }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(24.dp))
            .border(1.dp, TerremDivider, RoundedCornerShape(24.dp))
    ) {
        listOf("Fractional", "Non-Fractional").forEachIndexed { index, label ->
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(24.dp))
                    .background(if (index == selectedIndex) TerremPrimary else Color.Transparent)
                    .clickable { selectedIndex = index }
                    .padding(horizontal = 24.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label,
                    color = if (index == selectedIndex) Color.White else TerremTextSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
fun SearchBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(52.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFF2F2F2))
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Outlined.Search,
            contentDescription = "Search",
            tint = TerremTextTertiary,
            modifier = Modifier.size(22.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            "Search...",
            color = TerremTextTertiary,
            fontSize = 15.sp,
            modifier = Modifier.weight(1f)
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable { }
        ) {
            Text(
                "Commercial",
                color = TerremTextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium
            )
            Icon(
                Icons.Default.KeyboardArrowDown,
                contentDescription = "Type",
                tint = TerremTextPrimary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
fun CategoryChips() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        CategoryChip("Office Space", Icons.Outlined.Business)
        CategoryChip("Industrial", Icons.Outlined.Factory)
        CategoryChip("Commercial", Icons.Outlined.Apartment)
    }
}

@Composable
fun CategoryChip(label: String, icon: ImageVector) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(24.dp))
            .border(1.dp, TerremDivider, RoundedCornerShape(24.dp))
            .clickable { }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            icon,
            contentDescription = label,
            tint = TerremTextSecondary,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, fontSize = 13.sp, color = TerremTextPrimary, fontWeight = FontWeight.Medium)
    }
}
