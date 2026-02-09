package com.terrem.test.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.data.model.SampleData
import com.terrem.test.ui.theme.*

@Composable
fun PropertyDetailScreen(onBack: () -> Unit) {
    val property = SampleData.detailProperty
    var selectedTab by remember { mutableIntStateOf(0) }
    var selectedHighlightTab by remember { mutableIntStateOf(0) }

    Box(modifier = Modifier.fillMaxSize().background(TerremBackground)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 80.dp)
        ) {
            // Hero image area
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(320.dp)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color(0xFF6B8E7B), Color(0xFF8BA98F))
                        )
                    )
            ) {
                Text("🏘️", fontSize = 64.sp, modifier = Modifier.align(Alignment.Center))

                // Top actions
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    IconCircle(Icons.Default.ArrowBack, onClick = onBack)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconCircle(Icons.Default.FavoriteBorder)
                        IconCircle(Icons.Default.Share)
                    }
                }

                // Thumbnail strip
                Row(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 12.dp)
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    repeat(6) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color.White.copy(alpha = 0.4f))
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.Black.copy(alpha = 0.5f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("+10", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // Content card
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .offset(y = (-20).dp)
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                    .background(Color.White)
                    .padding(horizontal = 16.dp, vertical = 20.dp)
            ) {
                // Type badges
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TypeChip(property.type, TerremTextPrimary, Color(0xFFF0F0F0))
                    TypeChip(
                        property.constructionStatus,
                        TerremUnderConstructionOrange,
                        Color(0xFFFFF3E0)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Title + rating
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        property.name,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = TerremTextPrimary,
                        modifier = Modifier.weight(1f)
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(TerremStar)
                            .padding(horizontal = 10.dp, vertical = 5.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Star,
                                contentDescription = "Rating",
                                tint = Color.White,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                "${property.rating}",
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        "(${property.reviewCount})",
                        fontSize = 13.sp,
                        color = TerremTextSecondary
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Description
                Text(
                    property.description,
                    fontSize = 14.sp,
                    color = TerremTextSecondary,
                    lineHeight = 20.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "Read More",
                    fontSize = 14.sp,
                    color = TerremTeal,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { }
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Verification badges
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    VerificationBadge("RERA", Icons.Outlined.CheckCircle, TerremGreen)
                    VerificationBadge("Verified", Icons.Outlined.CheckCircle, TerremGreen)
                    VerificationBadge("Tenant", Icons.Outlined.CheckCircle, TerremGreen)
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Location and delivery
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.Top) {
                        Text("📍 ", fontSize = 13.sp)
                        Text(
                            property.location,
                            fontSize = 13.sp,
                            color = TerremTextSecondary,
                            lineHeight = 18.sp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
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
                                modifier = Modifier.size(14.dp),
                                tint = TerremTextSecondary
                            )
                        }
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Delivery:", fontSize = 12.sp, color = TerremTextSecondary)
                        Text(
                            property.deliveryDate,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = TerremTextPrimary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Tab bar: Property Snapshot | Highlights | Rental Overview
                val tabs = listOf("Property Snapshot", "Highlights", "Rental Overview")
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    tabs.forEachIndexed { index, title ->
                        Column(
                            modifier = Modifier
                                .clickable { selectedTab = index }
                                .padding(bottom = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                title,
                                fontSize = 14.sp,
                                fontWeight = if (index == selectedTab) FontWeight.Bold else FontWeight.Normal,
                                color = if (index == selectedTab) TerremPrimary else TerremTextSecondary
                            )
                            if (index == selectedTab) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Box(
                                    modifier = Modifier
                                        .width(60.dp)
                                        .height(2.dp)
                                        .background(TerremTeal)
                                )
                            }
                        }
                    }
                }

                HorizontalDivider(color = TerremDivider)

                Spacer(modifier = Modifier.height(16.dp))

                // Property Snapshot content
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Property Snapshot",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = TerremTextPrimary
                    )
                    Button(
                        onClick = { },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = TerremTextPrimary,
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text("Visit Property", fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Unit Details
                DetailSection("Unit Details") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            DetailItem(Icons.Outlined.KingBed, "BHK Type", property.bhkType)
                            Spacer(modifier = Modifier.height(16.dp))
                            DetailItem(Icons.Outlined.Weekend, "Interior Status", property.interiorStatus)
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            DetailItem(Icons.Outlined.Explore, "Facing", property.facing)
                            Spacer(modifier = Modifier.height(16.dp))
                            DetailItem(Icons.Outlined.Stairs, "Floor No", property.floorNo)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Project Details
                DetailSection("Project Details") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            DetailItem(Icons.Outlined.Landscape, "Land Area", property.landArea)
                            Spacer(modifier = Modifier.height(16.dp))
                            DetailItem(Icons.Outlined.SquareFoot, "Carpet Area", property.carpetArea)
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            DetailItem(Icons.Outlined.ZoomOutMap, "Built-up Area", property.builtUpArea)
                            Spacer(modifier = Modifier.height(16.dp))
                            DetailItem(Icons.Outlined.CropFree, "Common Area", property.commonArea)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Highlights section
                Text(
                    "Highlights",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = TerremTextPrimary
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Property / Features / Location tabs
                val highlightTabs = listOf("Property", "Features", "Location")
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(24.dp))
                        .background(Color(0xFFF2F2F2))
                        .padding(4.dp)
                ) {
                    highlightTabs.forEachIndexed { index, title ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(20.dp))
                                .background(
                                    if (index == selectedHighlightTab) TerremPrimary
                                    else Color.Transparent
                                )
                                .clickable { selectedHighlightTab = index }
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                title,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                color = if (index == selectedHighlightTab) Color.White
                                else TerremTextSecondary
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Highlight chips
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    property.highlights.forEach { highlight ->
                        HighlightChip(highlight)
                    }
                    HighlightChip("+30 More", isMore = true)
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Rental Overview
                Text(
                    "Rental Overview",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = TerremTextPrimary
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Govt Value / Market Value
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, TerremDivider, RoundedCornerShape(12.dp))
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Outlined.Home,
                            contentDescription = null,
                            tint = TerremTextSecondary,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Govt Value", fontSize = 12.sp, color = TerremTextSecondary)
                        Text("₹55L", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
                    }
                    Box(
                        modifier = Modifier
                            .width(1.dp)
                            .height(60.dp)
                            .background(TerremDivider)
                    )
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Outlined.TrendingUp,
                            contentDescription = null,
                            tint = TerremTextSecondary,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Market Value", fontSize = 12.sp, color = TerremTextSecondary)
                        Text("₹64L", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
                    }
                }

                Spacer(modifier = Modifier.height(40.dp))
            }
        }

        // Bottom price bar
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Color.White)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    property.totalPrice,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = TerremPrimary
                )
                Text(
                    "(excl registration fees & taxes etc)",
                    fontSize = 11.sp,
                    color = TerremTextSecondary
                )
            }
            Button(
                onClick = { },
                colors = ButtonDefaults.buttonColors(
                    containerColor = TerremTextPrimary,
                    contentColor = Color.White
                ),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(horizontal = 32.dp, vertical = 14.dp)
            ) {
                Text("Book Now", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun IconCircle(icon: ImageVector, onClick: () -> Unit = {}) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.7f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = TerremTextPrimary)
    }
}

@Composable
private fun TypeChip(text: String, textColor: Color, bgColor: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(bgColor)
            .padding(horizontal = 14.dp, vertical = 6.dp)
    ) {
        Text(text, fontSize = 13.sp, color = textColor, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun VerificationBadge(text: String, icon: ImageVector, color: Color) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .border(1.dp, TerremDivider, RoundedCornerShape(20.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(4.dp))
        Text(text, fontSize = 13.sp, color = TerremTextPrimary, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun DetailSection(title: String, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, TerremDivider, RoundedCornerShape(12.dp))
            .padding(16.dp)
    ) {
        Text(
            title,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = TerremTextPrimary
        )
        Spacer(modifier = Modifier.height(12.dp))
        content()
    }
}

@Composable
private fun DetailItem(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(Color(0xFFF5F5F5)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = label, modifier = Modifier.size(18.dp), tint = TerremTextSecondary)
        }
        Spacer(modifier = Modifier.width(8.dp))
        Column {
            Text(label, fontSize = 11.sp, color = TerremTextSecondary)
            Text(value, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
        }
    }
}

@Composable
private fun HighlightChip(text: String, isMore: Boolean = false) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .border(1.dp, TerremDivider, RoundedCornerShape(20.dp))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (!isMore) {
            Icon(
                Icons.Default.Check,
                contentDescription = null,
                tint = TerremTextSecondary,
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
        }
        Text(
            text,
            fontSize = 13.sp,
            color = if (isMore) TerremTextSecondary else TerremTextPrimary,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun FlowRow(
    modifier: Modifier = Modifier,
    horizontalArrangement: Arrangement.Horizontal = Arrangement.Start,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable () -> Unit
) {
    // Using built-in FlowRow from Compose Foundation
    androidx.compose.foundation.layout.FlowRow(
        modifier = modifier,
        horizontalArrangement = horizontalArrangement,
        verticalArrangement = verticalArrangement,
        content = { content() }
    )
}
