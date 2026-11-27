// Run before the long build: proves the patched signing library will ask Apple for HealthKit.
// Compiled with SideSign's own Feature.swift, Entitlement.swift, Team.swift and Account.swift.
import Foundation

var failures = 0
func check(_ ok: Bool, _ what: String) {
    if !ok {
        failures += 1
        print("::error::HealthKit patch check failed: \(what)")
    }
}

check(Feature(entitlement: Entitlement("com.apple.developer.healthkit"))?.rawValue == "HK421J6T7P",
      "the HealthKit entitlement maps to Apple's capability id")
check(TeamType.free.allowedFeatures?.contains(.healthKit) == true, "free accounts may request it")
check(TeamType.individual.allowedFeatures?.contains(.healthKit) == true, "paid accounts may request it")
check(TeamType.free.allowedFeatures == [.appGroups, .interAppAudio, .healthKit], "nothing else was added for free accounts")
check(Feature(entitlement: .appGroups) == .appGroups, "app groups still work")

if failures > 0 { exit(1) }
print("HealthKit patch check passed")
