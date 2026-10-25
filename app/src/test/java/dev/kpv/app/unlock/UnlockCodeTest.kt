package dev.kpv.app.unlock

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UnlockCodeTest {

    @Test
    fun addsKeyDigitByDigitWithoutCarry() {
        assertEquals("787089", UnlockCode.unlockCode("482177", "305912"))
    }

    @Test
    fun keepsLeadingZeros() {
        assertEquals("000000", UnlockCode.unlockCode("000001", "000009"))
        assertEquals("012345", UnlockCode.unlockCode("012345", "000000"))
    }

    @Test
    fun deviceCodeIsSixStableDigits() {
        val code = UnlockCode.deviceCode("a1b2c3d4e5f60718")
        assertTrue(code.matches(Regex("\\d{6}")))
        assertEquals(code, UnlockCode.deviceCode("a1b2c3d4e5f60718"))
    }

    @Test
    fun deviceCodeDiffersPerDevice() {
        assertNotEquals(UnlockCode.deviceCode("device-one"), UnlockCode.deviceCode("device-two"))
    }

    @Test
    fun matchesIgnoresSpacesAndDashes() {
        assertTrue(UnlockCode.matches("787 089", "482177", "305912"))
        assertTrue(UnlockCode.matches("787-089", "482177", "305912"))
        assertTrue(UnlockCode.matches("787089", "482177", "305912"))
    }

    @Test
    fun rejectsWrongOrShortCodes() {
        assertFalse(UnlockCode.matches("787088", "482177", "305912"))
        assertFalse(UnlockCode.matches("78708", "482177", "305912"))
        assertFalse(UnlockCode.matches("", "482177", "305912"))
    }

    @Test
    fun newKeyInvalidatesOldCode() {
        val old = UnlockCode.unlockCode("482177", "305912")
        assertFalse(UnlockCode.matches(old, "482177", "111111"))
    }
}
