package com.terrem.test.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.data.model.SampleData
import com.terrem.test.ui.components.*
import com.terrem.test.ui.theme.*

@Composable
fun HomeScreen(onPropertyClick: (Int) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(TerremBackground)
            .verticalScroll(rememberScrollState())
    ) {
        // Top bar with greeting
        TopBar()

        // Banner card
        BannerCard()

        // Discover section with search and filters
        DiscoverSection()

        Spacer(modifier = Modifier.height(24.dp))

        // Recent Activity section
        SectionHeader("Recent Activity")

        Spacer(modifier = Modifier.height(8.dp))

        SampleData.recentProperties.forEachIndexed { index, property ->
            RecentActivityCard(property = property, onClick = { onPropertyClick(property.id) })
            if (index < SampleData.recentProperties.lastIndex) {
                DashedDivider()
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Our Recommendations section
        SectionHeader("Our Recommendations")

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            SampleData.recommendations.forEach { property ->
                RecommendationCard(property = property, onClick = { onPropertyClick(property.id) })
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Trending Properties section
        SectionHeader("Trending Properties")

        Spacer(modifier = Modifier.height(12.dp))

        // 2-column grid
        Column(
            modifier = Modifier.padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            for (i in SampleData.trendingProperties.indices step 2) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        TrendingPropertyCard(
                            property = SampleData.trendingProperties[i],
                            onClick = { onPropertyClick(SampleData.trendingProperties[i].id) }
                        )
                    }
                    if (i + 1 < SampleData.trendingProperties.size) {
                        Box(modifier = Modifier.weight(1f)) {
                            TrendingPropertyCard(
                                property = SampleData.trendingProperties[i + 1],
                                onClick = { onPropertyClick(SampleData.trendingProperties[i + 1].id) }
                            )
                        }
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }

        // Bottom padding for nav bar
        Spacer(modifier = Modifier.height(100.dp))
    }
}

@Composable
fun SectionHeader(title: String) {
    Text(
        text = title,
        fontSize = 20.sp,
        fontWeight = FontWeight.Bold,
        color = TerremTextPrimary,
        modifier = Modifier.padding(horizontal = 16.dp)
    )
}

@Composable
fun DashedDivider() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        repeat(40) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(1.dp)
                    .background(Color(0xFFD0D0D0))
            )
            if (it < 39) {
                Spacer(modifier = Modifier.width(4.dp))
            }
        }
    }
}
