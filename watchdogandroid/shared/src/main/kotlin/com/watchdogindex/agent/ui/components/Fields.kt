package com.watchdogindex.agent.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillNode
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalAutofill
import androidx.compose.ui.platform.LocalAutofillTree
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.design.icons.WdIcons

/**
 * Outlined text field as the mockup draws it (`.mfield`): 2 dp ink border, 8 dp radius, floating 12 sp 700
 * label cut into the border, 15 sp 500 single-line value, trailing 22 dp muted icon (clear) in a 48 dp
 * target. The 8 dp above the box is the label's overlap allowance. A long value is ellipsised while the
 * field is not being edited (`.mfield .val`: nowrap + ellipsis); once focused it scrolls as a text field must.
 *
 * [keyboardOptions] and [keyboardActions] go straight to the text field, so a caller sets the keyboard the value
 * needs and what the action key does: an email address wants `KeyboardType.Email` with `ImeAction.Send` running
 * the send, a six-digit code `KeyboardType.NumberPassword` with `ImeAction.Done` running the verify, a listing
 * link `KeyboardType.Uri` with `ImeAction.Go`, an address `ImeAction.Search`, a name `ImeAction.Done`; the default
 * is the plain text keyboard whose action key only closes it. [autofill] (for example [WdAutofill.EmailAddress])
 * lets the platform's autofill service offer a saved value while the field is focused; it is a no-op where
 * there is no autofill (the desktop preview).
 */
@OptIn(ExperimentalComposeUiApi::class)
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
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    autofill: WdAutofill? = null,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(8.dp)
    val showTrailing = trailingIcon != null && onClear != null
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    // Autofill (the Compose 1.7 API, kept behind WdAutofill so callers need no experimental opt-in): the node is
    // registered in the tree with its window bounds and asked for a fill while the field has focus. Nothing is
    // registered when the caller names no hint.
    val autofillService = LocalAutofill.current
    val autofillTree = LocalAutofillTree.current
    val autofillNode = remember(autofill, onValueChange) {
        autofill?.let { AutofillNode(autofillTypes = listOf(it.platformType), onFill = onValueChange) }
    }
    if (autofillNode != null) autofillTree += autofillNode
    val autofillModifier = if (autofillNode == null) {
        Modifier
    } else {
        Modifier
            .onGloballyPositioned { autofillNode.boundingBox = it.boundsInWindow() }
            .onFocusChanged { state ->
                if (state.isFocused) autofillService?.requestAutofillForNode(autofillNode) else autofillService?.cancelAutofillForNode(autofillNode)
            }
    }
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
                    .semantics { contentDescription = label }
                    .then(autofillModifier),
                enabled = enabled,
                textStyle = t.fieldValue.copy(color = c.ink),
                singleLine = true,
                keyboardOptions = keyboardOptions,
                keyboardActions = keyboardActions,
                cursorBrush = SolidColor(c.ink),
                interactionSource = interactionSource,
                decorationBox = { innerTextField ->
                    Box {
                        if (value.isEmpty() && placeholder != null) {
                            Text(text = placeholder, color = c.muted, style = t.fieldValue, maxLines = 1)
                        }
                        // The editable field can only scroll a long value, so until it is focused the value is
                        // drawn as ellipsised text in the same style over the (invisible, still tappable) field.
                        val ellipsised = !focused && value.isNotEmpty()
                        Box(modifier = Modifier.alpha(if (ellipsised) 0f else 1f)) { innerTextField() }
                        if (ellipsised) {
                            Text(
                                text = value,
                                modifier = Modifier.clearAndSetSemantics { },
                                color = c.ink,
                                style = t.fieldValue,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
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

/**
 * What a [WdOutlinedField] may ask the platform's autofill service for. A plain enum in the public signature so
 * screens never touch the experimental autofill types themselves.
 */
enum class WdAutofill {
    /** An email address (Welcome's sign-in field). */
    EmailAddress,
    /** A one-time code from a message (Welcome's six-digit code). */
    OneTimeCode,
    /** A street address (Marketing's address field). */
    PostalAddress;

    @OptIn(ExperimentalComposeUiApi::class)
    internal val platformType: AutofillType
        get() = when (this) {
            EmailAddress -> AutofillType.EmailAddress
            OneTimeCode -> AutofillType.SmsOtpCode
            PostalAddress -> AutofillType.PostalAddress
        }
}

/**
 * Multi-line variant of [WdOutlinedField] (`.mfield` as a paste box): the same 2 dp ink border, 8 dp radius
 * and floating 12 sp 700 label, a 15 sp 500 value that wraps and grows from [minLines] lines (never shorter
 * than [minHeight]), padding 18 at the sides, 20 above and 12 below the text. The field is announced as
 * [label]. For pasted CSV and notes; a single-line value belongs in [WdOutlinedField].
 */
@Composable
fun WdOutlinedTextArea(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    enabled: Boolean = true,
    minLines: Int = 4,
    minHeight: Dp = 132.dp,
) {
    val c = WatchdogTheme.colors
    val t = WatchdogTheme.type
    val shape = RoundedCornerShape(8.dp)
    Box(modifier = modifier.fillMaxWidth()) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .background(c.bg, shape)
                .border(2.dp, c.ink, shape)
                .heightIn(min = minHeight)
                .padding(start = 18.dp, end = 18.dp, top = 20.dp, bottom = 12.dp)
                .semantics { contentDescription = label },
            enabled = enabled,
            textStyle = t.fieldValue.copy(color = c.ink),
            minLines = minLines,
            cursorBrush = SolidColor(c.ink),
            decorationBox = { innerTextField ->
                Box {
                    if (value.isEmpty() && placeholder != null) {
                        Text(text = placeholder, color = c.muted, style = t.fieldValue)
                    }
                    innerTextField()
                }
            },
        )
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
