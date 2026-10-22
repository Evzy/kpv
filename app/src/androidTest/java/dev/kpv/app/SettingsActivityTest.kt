package dev.kpv.app

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.action.ViewActions.pressImeActionButton
import androidx.test.espresso.action.ViewActions.replaceText
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsActivityTest {

    @Before
    fun clearSite() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        SiteConfig.init(ctx.applicationContext)
        SiteConfig.saveSite("")
    }

    @Test
    fun saveButton_persistsSiteUrl() {
        ActivityScenario.launch(SettingsActivity::class.java).use {
            onView(withId(R.id.site_origin)).perform(replaceText("https://save-button.test"))
            onView(withId(R.id.save)).perform(click())
        }
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        assertEquals("https://save-button.test", SiteConfig.siteUrl())
    }

    @Test
    fun imeDone_persistsSiteUrl() {
        ActivityScenario.launch(SettingsActivity::class.java).use {
            onView(withId(R.id.site_origin)).perform(
                replaceText("https://ime-done.test"),
                pressImeActionButton(),
            )
        }
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        assertEquals("https://ime-done.test", SiteConfig.siteUrl())
    }
}
