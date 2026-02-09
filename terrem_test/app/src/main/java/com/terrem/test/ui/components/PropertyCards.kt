package com.terrem.test.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.data.model.Property
import com.terrem.test.ui.theme.*

@Composable
fun RecentActivityCard(property: Property, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.Top
    ) {
        // Image placeholder
        Box(
            modifier = Modifier
                .size(width = 140.dp, height = 110.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFFD4C5B0)),
            contentAlignment = Alignment.Center
        ) {
            Text("🏠", fontSize = 32.sp)
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            // Property type badge
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFFF0F0F0))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text(
                    property.type,
                    fontSize = 12.sp,
                    color = TerremTextSecondary,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                property.name,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = TerremTextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Text(
                property.price,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = TerremGold
            )
            Text(
                property.priceLabel,
                fontSize = 12.sp,
                color = TerremTextSecondary
            )

            Spacer(modifier = Modifier.height(2.dp))

            Text(
                property.location,
                fontSize = 12.sp,
                color = TerremTextSecondary,
                lineHeight = 16.sp
            )
        }

        // Navigate icon
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(Color(0xFFF0F0F0))
                .align(Alignment.Bottom),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Default.Navigation,
                contentDescription = "Navigate",
                modifier = Modifier.size(18.dp).rotate(45f),
                tint = TerremTextSecondary
            )
        }
    }
}

@Composable
fun RecommendationCard(property: Property, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .width(320.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            // Image area with badges
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .background(Color(0xFF8B7355))
            ) {
                // Placeholder gradient
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            androidx.compose.ui.graphics.Brush.verticalGradient(
                                colors = listOf(
                                    Color(0xFF5A4A3A),
                                    Color(0xFF8B7355)
                                )
                            )
                        )
                )
                Text("🏡", fontSize = 48.sp, modifier = Modifier.align(Alignment.Center))

                // Badges row
                Row(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (property.isRera) {
                        Badge(text = "RERA", bgColor = TerremReraBg)
                    }
                    if (property.isVerified) {
                        Badge(text = "Verified", bgColor = TerremVerifiedBg)
                    }
                }

                // Heart icon
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(12.dp)
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(Color.White),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.FavoriteBorder,
                        contentDescription = "Favorite",
                        modifier = Modifier.size(20.dp),
                        tint = TerremTextPrimary
                    )
                }

                // Stats row at bottom
                Row(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.3f))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    StatItem("📊", property.returnPercent)
                    StatItem("💰", property.appreciationPercent)
                    StatItem("📐", property.sqft)
                }
            }

            // Content area
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        property.name,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = TerremTextPrimary
                    )
                    if (property.isHot) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("● ", color = TerremHotRed, fontSize = 10.sp)
                            Text(
                                "Hot",
                                color = TerremHotRed,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Progress bar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(TerremProgressBg)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(property.soldFractions.toFloat() / property.totalFractions)
                                .clip(RoundedCornerShape(3.dp))
                                .background(TerremProgressFill)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "${property.soldFractions}/${property.totalFractions} Sold",
                        fontSize = 12.sp,
                        color = TerremTextSecondary,
                        fontWeight = FontWeight.Medium
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    property.price,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = TerremTextPrimary
                )
                Text(
                    property.priceLabel,
                    fontSize = 13.sp,
                    color = TerremTextSecondary
                )

                Spacer(modifier = Modifier.height(4.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom
                ) {
                    Text(
                        property.location,
                        fontSize = 12.sp,
                        color = TerremTextSecondary,
                        lineHeight = 16.sp,
                        modifier = Modifier.weight(1f)
                    )
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFF0F0F0)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Navigation,
                            contentDescription = "Navigate",
                            modifier = Modifier.size(18.dp).rotate(45f),
                            tint = TerremTextSecondary
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TrendingPropertyCard(property: Property, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp)
                    .background(Color(0xFF8B7355))
            ) {
                Text("🏠", fontSize = 36.sp, modifier = Modifier.align(Alignment.Center))

                // Sold percentage badge
                if (property.soldPercent > 0) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(8.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(TerremGreen)
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            "(${property.soldPercent}% Sold)",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                // Heart icon
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.9f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.FavoriteBorder,
                        contentDescription = "Favorite",
                        modifier = Modifier.size(16.dp),
                        tint = TerremTextPrimary
                    )
                }
            }

            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    property.name,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = TerremTextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(2.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.Top
                    ) {
                        Text("📍 ", fontSize = 11.sp)
                        Text(
                            property.location,
                            fontSize = 11.sp,
                            color = TerremTextSecondary,
                            lineHeight = 15.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFF0F0F0)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Navigation,
                            contentDescription = "Navigate",
                            modifier = Modifier.size(14.dp).rotate(45f),
                            tint = TerremTextSecondary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    property.price,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = TerremTextPrimary
                )
                Text(
                    property.priceLabel,
                    fontSize = 11.sp,
                    color = TerremTextSecondary
                )

                Spacer(modifier = Modifier.height(6.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmallChip("📐 ${property.sqft}")
                    SmallChip("📊 ${property.returnPercent}")
                }
            }
        }
    }
}

@Composable
private fun Badge(text: String, bgColor: Color) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(bgColor.copy(alpha = 0.85f))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Outlined.CheckCircle,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(14.dp)
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(text, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun StatItem(icon: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(icon, fontSize = 14.sp)
        Spacer(modifier = Modifier.width(4.dp))
        Text(value, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun SmallChip(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFFF2F2F2))
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Text(text, fontSize = 11.sp, color = TerremTextSecondary)
    }
}
