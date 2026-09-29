package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons

/**
 * Outlined text field as the mockup draws it (`.mfield`): 2 dp ink border, 8 dp radius, floating 12 sp 700
 * label cut into the border, 15 sp 500 single-line value, trailing 22 dp muted icon (clear) in a 48 dp
 * target. The 8 dp above the box is the label's overlap allowance.
 */
@Composable
fun WdOutlinedField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    trailingIcon: ImageVector? = WdIcons.Cancel,
    trailingDescription: String = "Clear",
    onClear: (() -> Unit)? = null,
    placeholder: String? = null,
    enabled: Boolean = true,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(8.dp)
    val showTrailing = trailingIcon != null && onClear != null
    Box(modifier = modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .background(c.bg, shape)
                .border(2.dp, c.ink, shape),
            contentAlignment = Alignment.CenterEnd,
        ) {
            // CSS padding 18 44 10 16 sits inside a 2 dp border; Compose borders draw inside, so add the 2 dp here.
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 18.dp, end = if (showTrailing) 46.dp else 18.dp, top = 20.dp, bottom = 12.dp)
                    // The floating label is a separate Text, so the field carries its own name for TalkBack.
                    .semantics { contentDescription = label },
                enabled = enabled,
                textStyle = t.fieldValue.copy(color = c.ink),
                singleLine = true,
                cursorBrush = SolidColor(c.ink),
                decorationBox = { innerTextField ->
                    Box {
                        if (value.isEmpty() && placeholder != null) {
                            Text(text = placeholder, color = c.muted, style = t.fieldValue, maxLines = 1)
                        }
                        innerTextField()
                    }
                },
            )
            if (trailingIcon != null && onClear != null) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .clickable(enabled = enabled, role = Role.Button, onClick = onClear),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = trailingIcon,
                        contentDescription = trailingDescription,
                        modifier = Modifier.size(22.dp),
                        tint = c.muted,
                    )
                }
            }
        }
        Text(
            text = label,
            modifier = Modifier.padding(start = 12.dp).background(c.bg).padding(horizontal = 4.dp),
            color = c.ink,
            style = t.fieldLabel,
            maxLines = 1,
        )
    }
}

/** Field supporting text (`.msup`): 12 sp / 17.4 muted, padding 6 32 0. */
@Composable
fun SupportingText(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        modifier = modifier.fillMaxWidth().padding(start = 32.dp, end = 32.dp, top = 6.dp),
        color = WatchdogTheme.colors.muted,
        style = WatchdogTheme.type.caption.sized(12, FontWeight.Normal, 17.4),
    )
}
