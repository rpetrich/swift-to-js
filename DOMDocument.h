@import Foundation;
// #import <stdint.h>

// typedef _Bool BOOL;

// @interface NSObject
// @end

// @interface NSError : NSObject
// @end

// @interface NSString : NSObject
// @end

@interface DOMElement : NSObject
@end

//__attribute__((annotate("__swift native")))
@interface DOMDocument : NSObject
- (DOMElement *)createElement:(NSString *)elementName error:(NSError **)error;
- (DOMElement *)createElement:(NSString *)elementName value:(BOOL)value;
@end
