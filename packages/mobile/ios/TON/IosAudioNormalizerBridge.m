#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(IosAudioNormalizer, NSObject)

RCT_EXTERN_METHOD(normalize:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
