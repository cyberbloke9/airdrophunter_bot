package com.terrem.test.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.terrem.test.data.model.SampleData
import com.terrem.test.ui.TerremViewModel
import com.terrem.test.ui.components.HeroImagePlaceholder
import com.terrem.test.ui.theme.*

@Composable
fun PropertyDetailScreen(viewModel: TerremViewModel, onBack: () -> Unit) {
    val property = viewModel.detailProperty
    var selectedTab by remember { mutableIntStateOf(0) }
    var selectedHighlightTab by remember { mutableIntStateOf(0) }
    var showFullDescription by remember { mutableStateOf(false) }
    val isFav = viewModel.isFavorite(property.id)

    Box(modifier = Modifier.fillMaxSize().background(TerremBackground)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 85.dp)
        ) {
            // Hero
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(340.dp)
            ) {
                HeroImagePlaceholder(
                    gradientColors = property.imageGradient,
                    modifier = Modifier.fillMaxSize()
                )

                // Top navigation
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    ActionCircle(Icons.Default.ArrowBack, onClick = onBack)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        ActionCircle(
                            if (isFav) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            tint = if (isFav) TerremHotRed else TerremTextPrimary,
                            onClick = { viewModel.toggleFavorite(property.id) }
                        )
                        ActionCircle(Icons.Default.Share)
                    }
                }

                // Thumbnail strip
                Row(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 16.dp)
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    val thumbColors = listOf(
                        Color(0xFF8B7355), Color(0xFF6B8E7B), Color(0xFF5A7A9B),
                        Color(0xFFAA8866), Color(0xFF7B9A8B), Color(0xFF9B7B6B)
                    )
                    thumbColors.forEach { color ->
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(color.copy(alpha = 0.6f))
                                .border(1.5.dp, Color.White.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.Black.copy(alpha = 0.6f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "+${property.imageCount - 6}",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Content card
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .offset(y = (-24).dp)
                    .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                    .background(Color.White)
                    .padding(horizontal = 18.dp, vertical = 22.dp)
            ) {
                // Type badges
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TypeTag(property.type, TerremTextPrimary, TerremChipBg)
                    TypeTag(property.constructionStatus, TerremUnderConstructionOrange, Color(0xFFFFF3E0))
                }

                Spacer(modifier = Modifier.height(12.dp))

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
                    Spacer(modifier = Modifier.width(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(TerremStar)
                                .padding(horizontal = 10.dp, vertical = 5.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Star, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(3.dp))
                                Text("${property.rating}", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("(${property.reviewCount})", fontSize = 13.sp, color = TerremTextSecondary)
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Description with expand
                AnimatedContent(
                    targetState = showFullDescription,
                    transitionSpec = {
                        fadeIn(tween(300)) + expandVertically(tween(300)) togetherWith
                                fadeOut(tween(200)) + shrinkVertically(tween(200))
                    },
                    label = "desc"
                ) { expanded ->
                    Text(
                        property.description,
                        fontSize = 14.sp,
                        color = TerremTextSecondary,
                        lineHeight = 21.sp,
                        maxLines = if (expanded) Int.MAX_VALUE else 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    if (showFullDescription) "Show Less" else "Read More",
                    fontSize = 14.sp,
                    color = TerremTeal,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { showFullDescription = !showFullDescription }
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Verification badges
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (property.isRera) VerifPill("RERA", TerremGreen)
                    if (property.isVerified) VerifPill("Verified", TerremGreen)
                    if (property.hasTenant) VerifPill("Tenant", TerremGreen)
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Location + delivery
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Row(
                        verticalAlignment = Alignment.Top,
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Outlined.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp), tint = TerremTextSecondary)
                        Spacer(modifier = Modifier.width(2.dp))
                        Text(property.location, fontSize = 13.sp, color = TerremTextSecondary, lineHeight = 18.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(TerremChipBg),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Navigation, contentDescription = null, modifier = Modifier.size(14.dp), tint = TerremTextSecondary)
                        }
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Delivery:", fontSize = 12.sp, color = TerremTextSecondary)
                        Text(property.deliveryDate, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
                    }
                }

                Spacer(modifier = Modifier.height(22.dp))

                // Tabs
                val tabs = listOf("Property Snapshot", "Highlights", "Rental Overview")
                ScrollableTabRow(
                    selectedTabIndex = selectedTab,
                    containerColor = Color.Transparent,
                    contentColor = TerremPrimary,
                    edgePadding = 0.dp,
                    divider = { HorizontalDivider(color = TerremDivider) },
                    indicator = { tabPositions ->
                        if (selectedTab < tabPositions.size) {
                            TabRowDefaults.SecondaryIndicator(
                                modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
                                height = 3.dp,
                                color = TerremTeal
                            )
                        }
                    }
                ) {
                    tabs.forEachIndexed { index, title ->
                        Tab(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            text = {
                                Text(
                                    title,
                                    fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 14.sp
                                )
                            },
                            selectedContentColor = TerremPrimary,
                            unselectedContentColor = TerremTextSecondary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Tab content with crossfade
                AnimatedContent(
                    targetState = selectedTab,
                    transitionSpec = {
                        fadeIn(tween(300)) togetherWith fadeOut(tween(200))
                    },
                    label = "tab_content"
                ) { tab ->
                    when (tab) {
                        0 -> PropertySnapshotContent(property)
                        1 -> HighlightsContent(property, selectedHighlightTab) { selectedHighlightTab = it }
                        2 -> RentalOverviewContent()
                    }
                }
            }
        }

        // Bottom price bar
        Surface(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(),
            shadowElevation = 16.dp,
            color = Color.White
        ) {
            Row(
                modifier = Modifier
                    .padding(horizontal = 18.dp, vertical = 14.dp)
                    .navigationBarsPadding(),
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
                    contentPadding = PaddingValues(horizontal = 34.dp, vertical = 14.dp),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 4.dp)
                ) {
                    Text("Book Now", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun PropertySnapshotContent(property: com.terrem.test.data.model.Property) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Property Snapshot", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
            Button(
                onClick = { },
                colors = ButtonDefaults.buttonColors(containerColor = TerremTextPrimary, contentColor = Color.White),
                shape = RoundedCornerShape(8.dp),
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 9.dp),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp)
            ) {
                Text("Visit Property", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }

        Spacer(modifier = Modifier.height(18.dp))

        DetailCard("Unit Details") {
            DetailRow(
                left = { DetailItem(Icons.Outlined.KingBed, "BHK Type", property.bhkType) },
                right = { DetailItem(Icons.Outlined.Explore, "Facing", property.facing) }
            )
            Spacer(modifier = Modifier.height(18.dp))
            DetailRow(
                left = { DetailItem(Icons.Outlined.Weekend, "Interior Status", property.interiorStatus) },
                right = { DetailItem(Icons.Outlined.Stairs, "Floor No", property.floorNo) }
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        DetailCard("Project Details") {
            DetailRow(
                left = { DetailItem(Icons.Outlined.Landscape, "Land Area", property.landArea) },
                right = { DetailItem(Icons.Outlined.ZoomOutMap, "Built-up Area", property.builtUpArea) }
            )
            Spacer(modifier = Modifier.height(18.dp))
            DetailRow(
                left = { DetailItem(Icons.Outlined.SquareFoot, "Carpet Area", property.carpetArea) },
                right = { DetailItem(Icons.Outlined.CropFree, "Common Area", property.commonArea) }
            )
        }
    }
}

@Composable
private fun HighlightsContent(
    property: com.terrem.test.data.model.Property,
    selectedTab: Int,
    onTabChange: (Int) -> Unit
) {
    Column {
        Text("Highlights", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)

        Spacer(modifier = Modifier.height(14.dp))

        val highlightTabs = listOf("Property", "Features", "Location")
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(28.dp))
                .background(TerremChipBg)
                .padding(4.dp)
        ) {
            highlightTabs.forEachIndexed { index, title ->
                val isSelected = index == selectedTab
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(24.dp))
                        .background(
                            animateColorAsState(
                                if (isSelected) TerremPrimary else Color.Transparent,
                                tween(250), label = "hl_bg"
                            ).value
                        )
                        .clickable { onTabChange(index) }
                        .padding(vertical = 11.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        title,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = animateColorAsState(
                            if (isSelected) Color.White else TerremTextSecondary,
                            tween(250), label = "hl_text"
                        ).value
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        androidx.compose.foundation.layout.FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            property.highlights.forEach { hl ->
                HighlightChip(hl)
            }
            val remaining = 30 - property.highlights.size
            if (remaining > 0) {
                HighlightChip("+$remaining More", isMore = true)
            }
        }
    }
}

@Composable
private fun RentalOverviewContent() {
    Column {
        Text("Rental Overview", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
        Spacer(modifier = Modifier.height(14.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .border(1.dp, TerremDivider, RoundedCornerShape(14.dp))
                .padding(20.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(TerremChipBg),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Outlined.Home, contentDescription = null, tint = TerremTextSecondary, modifier = Modifier.size(24.dp))
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text("Govt Value", fontSize = 12.sp, color = TerremTextSecondary)
                Text("₹55L", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
            }
            Box(modifier = Modifier.width(1.dp).height(80.dp).background(TerremDivider))
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(TerremChipBg),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Outlined.TrendingUp, contentDescription = null, tint = TerremTextSecondary, modifier = Modifier.size(24.dp))
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text("Market Value", fontSize = 12.sp, color = TerremTextSecondary)
                Text("₹64L", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Monthly rental estimate
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xFFF0FAF5))
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Expected Monthly Rental", fontSize = 13.sp, color = TerremTextSecondary)
                Text("₹25,000 - ₹30,000", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TerremGreen)
            }
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(TerremGreen.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Outlined.AccountBalance, contentDescription = null, tint = TerremGreen, modifier = Modifier.size(22.dp))
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Occupancy rate
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .border(1.dp, TerremDivider, RoundedCornerShape(14.dp))
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Occupancy Rate", fontSize = 13.sp, color = TerremTextSecondary)
                Text("95%", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
            }
            Column {
                Text("Rental Yield", fontSize = 13.sp, color = TerremTextSecondary)
                Text("7.2%", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TerremTeal)
            }
        }
    }
}

// ---- Sub-components ----

@Composable
private fun ActionCircle(icon: ImageVector, tint: Color = TerremTextPrimary, onClick: () -> Unit = {}) {
    Box(
        modifier = Modifier
            .size(42.dp)
            .shadow(4.dp, CircleShape)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.85f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = tint)
    }
}

@Composable
private fun TypeTag(text: String, textColor: Color, bgColor: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(bgColor)
            .padding(horizontal = 14.dp, vertical = 6.dp)
    ) {
        Text(text, fontSize = 13.sp, color = textColor, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun VerifPill(text: String, color: Color) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .border(1.2.dp, TerremDivider, RoundedCornerShape(20.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(4.dp))
        Text(text, fontSize = 13.sp, color = TerremTextPrimary, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun DetailCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .border(1.dp, TerremDivider, RoundedCornerShape(14.dp))
            .padding(16.dp)
    ) {
        Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TerremTextPrimary)
        Spacer(modifier = Modifier.height(14.dp))
        content()
    }
}

@Composable
private fun DetailRow(left: @Composable () -> Unit, right: @Composable () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Box(modifier = Modifier.weight(1f)) { left() }
        Box(modifier = Modifier.weight(1f)) { right() }
    }
}

@Composable
private fun DetailItem(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(CircleShape)
                .background(TerremChipBg),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = label, modifier = Modifier.size(18.dp), tint = TerremTextSecondary)
        }
        Spacer(modifier = Modifier.width(10.dp))
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
            Icon(Icons.Default.Check, contentDescription = null, tint = TerremTextSecondary, modifier = Modifier.size(16.dp))
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
