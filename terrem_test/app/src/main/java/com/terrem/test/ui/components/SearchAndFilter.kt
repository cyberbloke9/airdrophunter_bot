package com.terrem.test.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.ui.theme.*

@Composable
fun DiscoverSection(
    selectedCity: String,
    onCityClick: () -> Unit,
    selectedTab: Int,
    onTabChange: (Int) -> Unit,
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    selectedCategory: String,
    onCategorySelect: (String) -> Unit,
    propertyType: String,
    onPropertyTypeClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = buildAnnotatedString {
                append("Discover Your Next\nProperties In ")
                withStyle(style = SpanStyle(color = TerremTeal)) {
                    append("Your City")
                }
            },
            fontSize = 25.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            lineHeight = 33.sp,
            color = TerremTextPrimary
        )

        Spacer(modifier = Modifier.height(14.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable(onClick = onCityClick)
        ) {
            Icon(
                Icons.Default.LocationOn,
                contentDescription = "Location",
                tint = TerremTextSecondary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                selectedCity,
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

        Spacer(modifier = Modifier.height(18.dp))

        FractionalToggle(selectedTab, onTabChange)

        Spacer(modifier = Modifier.height(18.dp))

        SearchBar(searchQuery, onSearchChange, propertyType, onPropertyTypeClick)

        Spacer(modifier = Modifier.height(14.dp))

        CategoryChips(selectedCategory, onCategorySelect)
    }
}

@Composable
fun FractionalToggle(selectedIndex: Int, onSelect: (Int) -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(28.dp))
            .border(1.2.dp, TerremDivider, RoundedCornerShape(28.dp))
            .padding(3.dp)
    ) {
        listOf("Fractional", "Non-Fractional").forEachIndexed { index, label ->
            val isSelected = index == selectedIndex
            val bgColor by animateColorAsState(
                targetValue = if (isSelected) TerremPrimary else Color.Transparent,
                animationSpec = tween(250),
                label = "tab_bg"
            )
            val textColor by animateColorAsState(
                targetValue = if (isSelected) Color.White else TerremTextSecondary,
                animationSpec = tween(250),
                label = "tab_text"
            )

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(24.dp))
                    .background(bgColor)
                    .clickable { onSelect(index) }
                    .padding(horizontal = 26.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label,
                    color = textColor,
                    fontSize = 14.sp,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium
                )
            }
        }
    }
}

@Composable
fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    propertyType: String,
    onTypeClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(52.dp)
            .shadow(2.dp, RoundedCornerShape(14.dp))
            .clip(RoundedCornerShape(14.dp))
            .background(TerremSearchBg)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Outlined.Search,
            contentDescription = "Search",
            tint = TerremTextTertiary,
            modifier = Modifier.size(22.dp)
        )
        Spacer(modifier = Modifier.width(10.dp))

        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.weight(1f),
            textStyle = TextStyle(
                fontSize = 15.sp,
                color = TerremTextPrimary
            ),
            cursorBrush = SolidColor(TerremTeal),
            singleLine = true,
            decorationBox = { innerTextField ->
                if (query.isEmpty()) {
                    Text("Search...", color = TerremTextTertiary, fontSize = 15.sp)
                }
                innerTextField()
            }
        )

        VerticalDivider(
            modifier = Modifier.height(24.dp).padding(horizontal = 8.dp),
            color = TerremDivider
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable(onClick = onTypeClick)
        ) {
            Text(
                propertyType,
                color = TerremTextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
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
fun CategoryChips(selectedCategory: String, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        CategoryChip("Office Space", Icons.Outlined.Business, selectedCategory == "Office Space") {
            onSelect("Office Space")
        }
        CategoryChip("Industrial", Icons.Outlined.Factory, selectedCategory == "Industrial") {
            onSelect("Industrial")
        }
        CategoryChip("Commercial", Icons.Outlined.Apartment, selectedCategory == "Commercial") {
            onSelect("Commercial")
        }
        CategoryChip("Warehouse", Icons.Outlined.Warehouse, selectedCategory == "Warehouse") {
            onSelect("Warehouse")
        }
    }
}

@Composable
fun CategoryChip(label: String, icon: ImageVector, isSelected: Boolean, onClick: () -> Unit) {
    val bgColor by animateColorAsState(
        targetValue = if (isSelected) TerremPrimary else Color.Transparent,
        animationSpec = tween(200),
        label = "chip_bg"
    )
    val contentColor by animateColorAsState(
        targetValue = if (isSelected) Color.White else TerremTextSecondary,
        animationSpec = tween(200),
        label = "chip_content"
    )
    val borderColor by animateColorAsState(
        targetValue = if (isSelected) TerremPrimary else TerremDivider,
        animationSpec = tween(200),
        label = "chip_border"
    )

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(24.dp))
            .border(1.dp, borderColor, RoundedCornerShape(24.dp))
            .background(bgColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = label, tint = contentColor, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, fontSize = 13.sp, color = contentColor, fontWeight = FontWeight.Medium)
    }
}
