package dev.kpv.app.update

import dev.kpv.app.update.ReleaseVersionCompare.VersusInstalled
import org.junit.Assert.assertEquals
import org.junit.Test

class ReleaseVersionCompareTest {
    @Test
    fun newerTagIsUpdate() {
        assertEquals(VersusInstalled.UPDATE_AVAILABLE, ReleaseVersionCompare.compare("v0.1.1", "0.1.0"))
        assertEquals(VersusInstalled.UPDATE_AVAILABLE, ReleaseVersionCompare.compare("v0.10.0", "0.9.9"))
    }

    @Test
    fun sameCoreIsUpToDate() {
        assertEquals(VersusInstalled.UP_TO_DATE, ReleaseVersionCompare.compare("v0.1.0", "0.1.0"))
        assertEquals(VersusInstalled.UP_TO_DATE, ReleaseVersionCompare.compare("v0.1.0-alpha", "0.1"))
    }

    @Test
    fun olderTagMeansInstalledNewer() {
        assertEquals(VersusInstalled.INSTALLED_NEWER, ReleaseVersionCompare.compare("v0.0.9", "0.1.0"))
    }

    @Test
    fun garbageIsUnknown() {
        assertEquals(VersusInstalled.UNKNOWN, ReleaseVersionCompare.compare("latest", "0.1.0"))
    }
}
