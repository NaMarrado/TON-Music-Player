#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(IosLoudnessAnalyzer, RCTEventEmitter)

RCT_EXTERN_METHOD(startAnalysis:(NSString *)filePath
                  targetLufs:(nonnull NSNumber *)targetLufs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancelAnalysis:(NSString *)taskId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
