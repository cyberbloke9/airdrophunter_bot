package com.terrem.test.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CropSquare
import androidx.compose.material.icons.outlined.Percent
import androidx.compose.material.icons.outlined.TrendingUp
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.data.model.Property
import com.terrem.test.ui.theme.*

@Composable
fun RecentActivityCard(
    property: Property,
    isFavorite: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top
    ) {
        PropertyImagePlaceholder(
            gradientColors = property.imageGradient,
            modifier = Modifier.size(width = 140.dp, height = 115.dp),
            cornerRadius = 14.dp,
            iconSize = 32.dp,
            propertyType = property.type
        )

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(TerremChipBg)
                    .padding(horizontal = 14.dp, vertical = 5.dp)
            ) {
                Text(
                    property.type,
                    fontSize = 12.sp,
                    color = TerremTextSecondary,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(5.dp))

            Text(
                property.name,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = TerremTextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(2.dp))

            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    property.price,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = TerremGold
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    property.priceLabel,
                    fontSize = 11.sp,
                    color = TerremTextSecondary,
                    modifier = Modifier.padding(bottom = 2.dp)
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                property.location,
                fontSize = 12.sp,
                color = TerremTextSecondary,
                lineHeight = 16.sp
            )
        }

        NavigateButton(modifier = Modifier.align(Alignment.Bottom))
    }
}

@Composable
fun RecommendationCard(
    property: Property,
    isFavorite: Boolean,
    onFavoriteClick: () -> Unit,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .width(320.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(210.dp)
            ) {
                PropertyImagePlaceholder(
                    gradientColors = property.imageGradient,
                    modifier = Modifier.fillMaxSize(),
                    cornerRadius = 0.dp,
                    iconSize = 48.dp,
                    propertyType = property.type
                )

                // Badges
                Row(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (property.isRera) {
                        VerifBadge("RERA", TerremReraBg)
                    }
                    if (property.isVerified) {
                        VerifBadge("Verified", TerremVerifiedBg)
                    }
                }

                // Favorite
                FavoriteButton(
                    isFavorite = isFavorite,
                    onClick = onFavoriteClick,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(12.dp)
                )

                // Stats overlay
                Row(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.65f))
                            )
                        )
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    StatItem(Icons.Outlined.TrendingUp, property.returnPercent)
                    StatItem(Icons.Outlined.Percent, property.appreciationPercent)
                    StatItem(Icons.Outlined.CropSquare, property.sqft)
                }
            }

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
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(TerremHotRed)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                "Hot",
                                color = TerremHotRed,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Progress bar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(7.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(TerremProgressBg)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(property.soldFractions.toFloat() / property.totalFractions)
                                .clip(RoundedCornerShape(4.dp))
                                .background(
                                    Brush.horizontalGradient(
                                        colors = listOf(TerremTeal, TerremProgressFill)
                                    )
                                )
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        "${property.soldFractions}/${property.totalFractions} Sold",
                        fontSize = 12.sp,
                        color = TerremTextSecondary,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        property.price,
                        fontSize = 21.sp,
                        fontWeight = FontWeight.Bold,
                        color = TerremTextPrimary
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        property.priceLabel,
                        fontSize = 13.sp,
                        color = TerremTextSecondary,
                        modifier = Modifier.padding(bottom = 2.dp)
                    )
                }

                Spacer(modifier = Modifier.height(6.dp))

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
                    NavigateButton()
                }
            }
        }
    }
}

@Composable
fun TrendingPropertyCard(
    property: Property,
    isFavorite: Boolean,
    onFavoriteClick: () -> Unit,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(155.dp)
            ) {
                PropertyImagePlaceholder(
                    gradientColors = property.imageGradient,
                    modifier = Modifier.fillMaxSize(),
                    cornerRadius = 0.dp,
                    iconSize = 32.dp,
                    propertyType = property.type
                )

                if (property.soldPercent > 0) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(8.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(TerremGreenBadge)
                            .padding(horizontal = 9.dp, vertical = 4.dp)
                    ) {
                        Text(
                            "(${property.soldPercent}% Sold)",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                FavoriteButton(
                    isFavorite = isFavorite,
                    onClick = onFavoriteClick,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp),
                    size = 30
                )
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

                Spacer(modifier = Modifier.height(3.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp).padding(top = 2.dp),
                            tint = TerremTextTertiary
                        )
                        Spacer(modifier = Modifier.width(3.dp))
                        Text(
                            property.location,
                            fontSize = 11.sp,
                            color = TerremTextSecondary,
                            lineHeight = 15.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    NavigateButton(size = 28)
                }

                Spacer(modifier = Modifier.height(6.dp))

                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        property.price,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = TerremTextPrimary
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        property.priceLabel,
                        fontSize = 11.sp,
                        color = TerremTextSecondary,
                        modifier = Modifier.padding(bottom = 2.dp)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmallInfoChip("📐 ${property.sqft}")
                    SmallInfoChip("📊 ${property.returnPercent}")
                }
            }
        }
    }
}

// ---- Shared sub-components ----

@Composable
fun FavoriteButton(
    isFavorite: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Int = 36
) {
    Box(
        modifier = modifier
            .size(size.dp)
            .shadow(2.dp, CircleShape)
            .clip(CircleShape)
            .background(Color.White)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        AnimatedContent(
            targetState = isFavorite,
            transitionSpec = {
                scaleIn(animationSpec = tween(200)) togetherWith
                        scaleOut(animationSpec = tween(200))
            },
            label = "fav"
        ) { fav ->
            Icon(
                if (fav) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                contentDescription = "Favorite",
                modifier = Modifier.size((size * 0.55f).dp),
                tint = if (fav) TerremHotRed else TerremTextPrimary
            )
        }
    }
}

@Composable
fun NavigateButton(modifier: Modifier = Modifier, size: Int = 36) {
    Box(
        modifier = modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(TerremChipBg),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            Icons.Default.Navigation,
            contentDescription = "Navigate",
            modifier = Modifier
                .size((size * 0.5f).dp)
                .rotate(45f),
            tint = TerremTextSecondary
        )
    }
}

@Composable
private fun VerifBadge(text: String, bgColor: Color) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(bgColor.copy(alpha = 0.9f))
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
        Text(text, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun StatItem(icon: ImageVector, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color.White.copy(alpha = 0.85f))
        Spacer(modifier = Modifier.width(4.dp))
        Text(value, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun SmallInfoChip(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(TerremChipBg)
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Text(text, fontSize = 11.sp, color = TerremTextSecondary, fontWeight = FontWeight.Medium)
    }
}
