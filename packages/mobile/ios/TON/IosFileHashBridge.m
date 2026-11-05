#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(IosFileHash, NSObject)

RCT_EXTERN_METHOD(hashFileSha256:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
