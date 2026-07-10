package ai.obrigada.guardian.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// The guardian's palette. Warm, calm, confident — it lives on a wall in someone's home,
// so it should feel like a quiet presence, not a security console. Mirrors the Obrigada
// brand neutrals and the green accent.
private val Accent = Color(0xFF3F8F6B)
private val Ink = Color(0xFFF3F1EC)
private val Bg = Color(0xFF111311)
private val Surface = Color(0xFF1B1E1B)

private val GuardianDark =
    darkColorScheme(
        primary = Accent,
        onPrimary = Color(0xFF07120D),
        background = Bg,
        onBackground = Ink,
        surface = Surface,
        onSurface = Ink,
        error = Color(0xFFE5786B),
    )

@Composable
fun GuardianTheme(content: @Composable () -> Unit) {
    // The guardian always uses the dark, low-glow scheme regardless of the system setting:
    // it sits on a wall in a room and must not glow white at night.
    MaterialTheme(colorScheme = GuardianDark, content = content)
}
