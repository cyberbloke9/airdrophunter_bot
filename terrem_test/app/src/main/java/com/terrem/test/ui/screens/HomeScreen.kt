package com.terrem.test.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.ui.TerremViewModel
import com.terrem.test.ui.components.*
import com.terrem.test.ui.theme.*

@Composable
fun HomeScreen(viewModel: TerremViewModel, onPropertyClick: (Int) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(TerremBackground)
            .verticalScroll(rememberScrollState())
    ) {
        Spacer(modifier = Modifier.statusBarsPadding())

        TopBar()

        Spacer(modifier = Modifier.height(4.dp))

        BannerCard()

        DiscoverSection(
            selectedCity = viewModel.selectedCity.value,
            onCityClick = { },
            selectedTab = viewModel.selectedFractionalTab.value,
            onTabChange = { viewModel.selectedFractionalTab.value = it },
            searchQuery = viewModel.searchQuery.value,
            onSearchChange = { viewModel.searchQuery.value = it },
            selectedCategory = viewModel.selectedCategory.value,
            onCategorySelect = { cat ->
                viewModel.selectedCategory.value =
                    if (viewModel.selectedCategory.value == cat) "" else cat
            },
            propertyType = viewModel.selectedPropertyType.value,
            onPropertyTypeClick = { }
        )

        Spacer(modifier = Modifier.height(28.dp))

        // Recent Activity
        SectionHeader("Recent Activity")
        Spacer(modifier = Modifier.height(8.dp))

        viewModel.recentProperties.forEachIndexed { index, property ->
            RecentActivityCard(
                property = property,
                isFavorite = viewModel.isFavorite(property.id),
                onClick = { onPropertyClick(property.id) }
            )
            if (index < viewModel.recentProperties.lastIndex) {
                DashedDivider()
            }
        }

        Spacer(modifier = Modifier.height(28.dp))

        // Our Recommendations
        SectionHeader("Our Recommendations")
        Spacer(modifier = Modifier.height(14.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            viewModel.recommendations.forEach { property ->
                RecommendationCard(
                    property = property,
                    isFavorite = viewModel.isFavorite(property.id),
                    onFavoriteClick = { viewModel.toggleFavorite(property.id) },
                    onClick = { onPropertyClick(property.id) }
                )
            }
        }

        Spacer(modifier = Modifier.height(28.dp))

        // Trending Properties
        SectionHeader("Trending Properties")
        Spacer(modifier = Modifier.height(14.dp))

        Column(
            modifier = Modifier.padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            for (i in viewModel.trendingProperties.indices step 2) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        val p = viewModel.trendingProperties[i]
                        TrendingPropertyCard(
                            property = p,
                            isFavorite = viewModel.isFavorite(p.id),
                            onFavoriteClick = { viewModel.toggleFavorite(p.id) },
                            onClick = { onPropertyClick(p.id) }
                        )
                    }
                    if (i + 1 < viewModel.trendingProperties.size) {
                        Box(modifier = Modifier.weight(1f)) {
                            val p = viewModel.trendingProperties[i + 1]
                            TrendingPropertyCard(
                                property = p,
                                isFavorite = viewModel.isFavorite(p.id),
                                onFavoriteClick = { viewModel.toggleFavorite(p.id) },
                                onClick = { onPropertyClick(p.id) }
                            )
                        }
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(100.dp))
    }
}

@Composable
fun SectionHeader(title: String) {
    Text(
        text = title,
        fontSize = 21.sp,
        fontWeight = FontWeight.Bold,
        color = TerremTextPrimary,
        modifier = Modifier.padding(horizontal = 16.dp)
    )
}

@Composable
fun DashedDivider() {
    val color = TerremDividerDash
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .height(1.dp)
    ) {
        drawLine(
            color = color,
            start = Offset(0f, 0f),
            end = Offset(size.width, 0f),
            pathEffect = PathEffect.dashPathEffect(
                floatArrayOf(8f, 6f),
                0f
            ),
            strokeWidth = 2f
        )
    }
}
