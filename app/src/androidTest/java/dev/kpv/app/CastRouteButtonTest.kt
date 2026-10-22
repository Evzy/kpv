package dev.kpv.app

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import org.junit.Test
import org.junit.runner.RunWith

/** Regression: Cast route chooser requires a FragmentActivity host. */
@RunWith(AndroidJUnit4::class)
@LargeTest
class CastRouteButtonTest {

    @Test
    fun mainActivity_isFragmentActivityHost() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                check(activity is androidx.fragment.app.FragmentActivity)
            }
        }
    }
}
