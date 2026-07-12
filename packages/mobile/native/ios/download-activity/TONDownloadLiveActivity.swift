import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.1, *)
struct TONDownloadLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: TONDownloadActivityAttributes.self) { context in
      VStack(spacing: 10) {
        HStack(spacing: 12) {
          Image(systemName: "arrow.down.circle.fill")
            .font(.system(size: 28, weight: .semibold))
            .foregroundStyle(.white)

          VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.title)
              .font(.headline)
              .foregroundStyle(.white)
              .lineLimit(1)

            if !context.attributes.artist.isEmpty {
              Text(context.attributes.artist)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
          }

          Spacer(minLength: 8)

          Text("\(context.state.progressPercent)%")
            .font(.headline.monospacedDigit())
            .foregroundStyle(.white)
        }

        ProgressView(value: Double(context.state.progressPercent), total: 100)
          .tint(.white)
      }
      .padding(16)
      .activityBackgroundTint(Color(red: 0.03, green: 0.03, blue: 0.03))
      .activitySystemActionForegroundColor(.white)
      .widgetURL(URL(string: "ton://downloads"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "arrow.down.circle.fill")
            .font(.title2)
            .foregroundStyle(.white)
        }

        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 2) {
            Text(context.attributes.title)
              .font(.headline)
              .lineLimit(1)
            if !context.attributes.artist.isEmpty {
              Text(context.attributes.artist)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
          }
        }

        DynamicIslandExpandedRegion(.trailing) {
          Text("\(context.state.progressPercent)%")
            .font(.headline.monospacedDigit())
        }

        DynamicIslandExpandedRegion(.bottom) {
          ProgressView(value: Double(context.state.progressPercent), total: 100)
            .tint(.white)
        }
      } compactLeading: {
        Image(systemName: "arrow.down")
          .foregroundStyle(.white)
      } compactTrailing: {
        Text("\(context.state.progressPercent)%")
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.white)
      } minimal: {
        Image(systemName: "arrow.down")
          .foregroundStyle(.white)
      }
      .keylineTint(.white.opacity(0.3))
      .widgetURL(URL(string: "ton://downloads"))
    }
  }
}
