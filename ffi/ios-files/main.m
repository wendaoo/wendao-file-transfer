// One request per process: isolates blocking device calls and their lifetime from Electron.
#import <Foundation/Foundation.h>
#include <libimobiledevice/libimobiledevice.h>
#include <libimobiledevice/lockdown.h>
#include <libimobiledevice/installation_proxy.h>
#include <libimobiledevice/house_arrest.h>
#include <libimobiledevice/afc.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

static idevice_t device;
static lockdownd_client_t lockdown;
static afc_client_t afc;
static house_arrest_client_t house;
static NSString *currentApp;
static NSFileManager *fm;
static uint64_t totalBytes, copiedBytes;
static NSUInteger totalFiles, completedFiles;
static NSTimeInterval started, lastProgress;
static NSString *direction;

static void Fail(NSString *message) { @throw [NSException exceptionWithName:@"IOSFiles" reason:message userInfo:nil]; }
static void Emit(NSDictionary *value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    fwrite(data.bytes, 1, data.length, stdout); fputc('\n', stdout); fflush(stdout);
}
static id Object(plist_t p) {
    if (!p) return nil;
    char *xml = NULL; uint32_t length = 0;
    plist_to_xml(p, &xml, &length);
    id result = xml ? [NSPropertyListSerialization propertyListWithData:[NSData dataWithBytes:xml length:length] options:NSPropertyListImmutable format:nil error:nil] : nil;
    free(xml); plist_free(p); return result;
}
static void Check(int code, NSString *action) {
    if (!code) return;
    NSString *detail = code == AFC_E_NO_SPACE_LEFT ? @"设备空间不足" : code == AFC_E_PERM_DENIED ? @"访问被拒绝，请解锁 iPhone" : code == AFC_E_OBJECT_NOT_FOUND ? @"文件不存在" : @"请检查 USB 连接、解锁状态及 App 文件共享权限";
    Fail([NSString stringWithFormat:@"%@失败（%d）：%@", action, code, detail]);
}
static NSString *ValidPath(id value, BOOL rootAllowed) {
    if (![value isKindOfClass:NSString.class] || ![value hasPrefix:@"/"] || [value rangeOfString:[NSString stringWithFormat:@"%C", (unichar)0]].location != NSNotFound || [[value componentsSeparatedByString:@"/"] containsObject:@".."])
        Fail(@"文件路径无效");
    NSString *p = [value stringByStandardizingPath];
    if (!rootAllowed && [p isEqual:@"/"]) Fail(@"不能修改设备根目录");
    return p;
}
static NSArray *Apps(void) {
    instproxy_client_t client = NULL;
    Check(instproxy_client_start_service(device, &client, "OpenMTP"), @"读取共享 App");
    plist_t options = instproxy_client_options_new(), result = NULL;
    instproxy_client_options_add(options, "ApplicationType", "Any", NULL);
    int code = instproxy_browse(client, options, &result);
    instproxy_client_options_free(options); instproxy_client_free(client);
    Check(code, @"读取共享 App");
    NSArray *all = Object(result);
    NSMutableArray *apps = [NSMutableArray array];
    for (NSDictionary *app in all) {
        NSString *bundle = app[@"CFBundleIdentifier"];
        if ([app[@"UIFileSharingEnabled"] boolValue] && bundle.length && [bundle rangeOfString:@"/"].location == NSNotFound)
            [apps addObject:@{@"id":bundle, @"name":app[@"CFBundleDisplayName"] ?: app[@"CFBundleName"] ?: bundle}];
    }
    return [apps sortedArrayUsingDescriptors:@[[NSSortDescriptor sortDescriptorWithKey:@"name" ascending:YES selector:@selector(localizedStandardCompare:)]]];
}
static NSString *Remote(NSString *virtualPath, BOOL allowAppRoot) {
    NSString *p = ValidPath(virtualPath, NO);
    NSArray *parts = [p pathComponents];
    if (parts.count < 2 || (!allowAppRoot && parts.count < 3)) Fail(@"请先进入一个 App 的文档目录，不能修改或传输 App 本身");
    NSString *bundle = parts[1];
    if (![bundle isEqual:currentApp]) {
        // VendDocuments itself enforces UIFileSharingEnabled on the device.
        if (afc) { afc_client_free(afc); afc = NULL; }
        if (house) { house_arrest_client_free(house); house = NULL; }
        Check(house_arrest_client_start_service(device, &house, "OpenMTP"), @"打开 App 文档");
        Check(house_arrest_send_command(house, "VendDocuments", bundle.UTF8String), @"申请文档访问");
        plist_t response = NULL;
        Check(house_arrest_get_result(house, &response), @"读取访问授权");
        NSDictionary *reply = Object(response);
        if (reply[@"Error"]) Fail([NSString stringWithFormat:@"无法访问 App 文档：%@", reply[@"Error"]]);
        Check(afc_client_new_from_house_arrest_client(house, &afc), @"连接 App 文档");
        currentApp = bundle;
    }
    NSString *remote = @"/Documents";
    for (NSUInteger i=2; i<parts.count; i++) remote = [remote stringByAppendingPathComponent:parts[i]];
    return remote;
}
static NSDictionary *Stat(NSString *p, BOOL optional) {
    char **values = NULL;
    int code = afc_get_file_info(afc, p.UTF8String, &values);
    if (optional && code == AFC_E_OBJECT_NOT_FOUND) return nil;
    Check(code, @"读取文件属性");
    NSMutableDictionary *info = [NSMutableDictionary dictionary];
    for (int i=0; values && values[i] && values[i+1]; i+=2) info[@(values[i])] = @(values[i+1]);
    afc_dictionary_free(values);
    if (![info[@"st_ifmt"] isEqual:@"S_IFDIR"] && ![info[@"st_ifmt"] isEqual:@"S_IFREG"]) Fail(@"不支持符号链接或特殊文件");
    return info;
}
static void SafeRemote(NSString *p, BOOL optionalLeaf) {
    NSString *part = @"";
    NSArray *components = [p pathComponents];
    for (NSUInteger i=0; i<components.count; i++) {
        part = [part stringByAppendingPathComponent:components[i]];
        Stat(part, optionalLeaf && i == components.count-1);
    }
}
static NSArray *Children(NSString *p) {
    char **values = NULL; Check(afc_read_directory(afc, p.UTF8String, &values), @"读取目录");
    NSMutableArray *names = [NSMutableArray array];
    for (int i=0; values && values[i]; i++) {
        NSString *name = @(values[i]);
        if (![name isEqual:@"."] && ![name isEqual:@".."] && ![name containsString:@"/"]) [names addObject:name];
    }
    afc_dictionary_free(values); return names;
}
static struct stat LocalStat(NSString *p) {
    struct stat s;
    if (lstat(p.fileSystemRepresentation, &s)) Fail(@"无法读取本地文件");
    if (!S_ISREG(s.st_mode) && !S_ISDIR(s.st_mode)) Fail(@"不支持符号链接或特殊文件");
    return s;
}
static void SafeLocalParent(NSString *p) {
    NSString *resolved = [p stringByResolvingSymlinksInPath];
    // macOS uses /var and /tmp symlinks. Resolve the chosen destination once;
    // descendants are exclusively created and never traverse pre-existing links.
    if (!S_ISDIR(LocalStat(resolved).st_mode)) Fail(@"本地目标不是目录");
}
static uint64_t Measure(NSString *p, BOOL local) {
    BOOL directory; uint64_t size;
    if (local) { struct stat s=LocalStat(p); directory=S_ISDIR(s.st_mode); size=s.st_size; }
    else { NSDictionary *s=Stat(p, NO); directory=[s[@"st_ifmt"] isEqual:@"S_IFDIR"]; size=[s[@"st_size"] longLongValue]; }
    if (!directory) { totalFiles++; return size; }
    NSArray *children = local ? [fm contentsOfDirectoryAtPath:p error:nil] : Children(p);
    if (!children) Fail(@"无法读取本地目录");
    uint64_t sum=0;
    for (NSString *name in children) sum += Measure([p stringByAppendingPathComponent:name], local);
    return sum;
}
static void Progress(NSString *p, uint64_t size, uint64_t sent, BOOL force) {
    NSTimeInterval now = NSDate.timeIntervalSinceReferenceDate;
    if (!force && now-lastProgress < 0.1) return;
    lastProgress=now;
    double pct = size ? 100.0*sent/size : 100;
    Emit(@{@"progress":@{@"currentFile":p, @"activeFileSize":@(size), @"activeFileSizeSent":@(sent), @"activeFileProgress":@(pct), @"totalFiles":@(totalFiles), @"filesSent":@(completedFiles), @"filesSentProgress":@(totalFiles ? 100.0*completedFiles/totalFiles : 100), @"totalFileSize":@(totalBytes), @"totalFileSizeSent":@(copiedBytes), @"totalFileProgress":@(totalBytes ? 100.0*copiedBytes/totalBytes : 100), @"elapsedTime":[NSString stringWithFormat:@"%.1fs",now-started], @"speed":@"--", @"direction":direction, @"indeterminate":@NO}});
}
static void CopyTree(NSString *source, NSString *target, BOOL upload) {
    BOOL directory; uint64_t size;
    if (upload) { struct stat s=LocalStat(source); directory=S_ISDIR(s.st_mode); size=s.st_size; }
    else { NSDictionary *s=Stat(source, NO); directory=[s[@"st_ifmt"] isEqual:@"S_IFDIR"]; size=[s[@"st_size"] longLongValue]; }
    if (upload) { if (Stat(target, YES)) Fail(@"目标已存在，请重命名后重试"); }
    else { struct stat s; if (!lstat(target.fileSystemRepresentation,&s)) Fail(@"目标已存在，请重命名后重试"); }
    if (directory) {
        if (upload) Check(afc_make_directory(afc,target.UTF8String), @"创建目录");
        else if (mkdir(target.fileSystemRepresentation,0700)) Fail(@"无法创建本地目录");
        NSArray *children=upload ? [fm contentsOfDirectoryAtPath:source error:nil] : Children(source);
        if (!children) Fail(@"无法读取本地目录");
        for (NSString *name in children) CopyTree([source stringByAppendingPathComponent:name],[target stringByAppendingPathComponent:name],upload);
        return;
    }
    uint64_t handle=0, sent=0;
    int fd=-1;
    @try {
        if (upload) {
            fd=open(source.fileSystemRepresentation,O_RDONLY|O_NOFOLLOW);
            if (fd<0) Fail(@"无法打开本地源文件");
            Check(afc_file_open(afc,target.UTF8String,AFC_FOPEN_WRONLY,&handle),@"打开设备目标文件");
        } else {
            Check(afc_file_open(afc,source.UTF8String,AFC_FOPEN_RDONLY,&handle),@"打开设备源文件");
            fd=open(target.fileSystemRepresentation,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW,0600);
            if (fd<0) Fail(@"无法创建本地目标文件");
        }
        char buffer[256*1024];
        while (YES) {
            uint32_t count=0;
            if (upload) {
                ssize_t n=read(fd,buffer,sizeof(buffer)); if (n<0) Fail(@"读取本地文件失败"); count=(uint32_t)n;
            } else Check(afc_file_read(afc,handle,buffer,sizeof(buffer),&count),@"读取设备文件");
            if (!count) break;
            uint32_t offset=0;
            while (offset<count) {
                uint32_t written=0;
                if (upload) Check(afc_file_write(afc,handle,buffer+offset,count-offset,&written),@"写入设备文件");
                else { ssize_t n=write(fd,buffer+offset,count-offset); if(n<=0) Fail(@"写入本地文件失败，请检查磁盘空间"); written=(uint32_t)n; }
                if (!written) Fail(@"传输中断");
                offset+=written;
            }
            sent+=count; copiedBytes+=count; Progress(source,size,sent,NO);
        }
        if(sent!=size) Fail(@"传输期间源文件发生变化，请重试");
        Check(afc_file_close(afc,handle),@"完成设备文件写入"); handle=0;
        if(!upload && fsync(fd)) Fail(@"本地文件保存失败");
        completedFiles++; Progress(source,size,sent,YES);
    } @finally { if(handle) afc_file_close(afc,handle); if(fd>=0) close(fd); }
}
static void RemoveTree(NSString *p) {
    NSDictionary *s=Stat(p,NO);
    if ([s[@"st_ifmt"] isEqual:@"S_IFDIR"]) for (NSString *name in Children(p)) RemoveTree([p stringByAppendingPathComponent:name]);
    Check(afc_remove_path(afc,p.UTF8String),@"删除文件");
}
static id Run(NSDictionary *r) {
    NSString *op=r[@"operation"];
    char **ids=NULL; int count=0;
    Check(idevice_get_device_list(&ids,&count),@"检测 iPhone");
    NSMutableArray *devices=[NSMutableArray array];
    for(int i=0;i<count;i++) [devices addObject:@(ids[i])];
    idevice_device_list_free(ids);
    if([op isEqual:@"devices"]) return devices;
    if([op isEqual:@"connect"] && !devices.count) return NSNull.null;
    if([op isEqual:@"connect"] && devices.count>1) Fail(@"检测到多台 iOS 设备，请只连接需要管理的一台");
    NSString *serial=[op isEqual:@"connect"] ? devices.firstObject : r[@"serial"];
    if(![devices containsObject:serial ?: @""]) Fail(@"iPhone 已断开，请重新连接");
    Check(idevice_new_with_options(&device,serial.UTF8String,IDEVICE_LOOKUP_USBMUX),@"连接 iPhone");
    int code=lockdownd_client_new_with_handshake(device,&lockdown,"OpenMTP");
    if(code) Fail([NSString stringWithFormat:@"无法访问 iPhone（%d）。请解锁设备，在 iPhone 上选择“信任此电脑”，然后点击重新连接。",code]);
    if([op isEqual:@"connect"]) {
        char *name=NULL; lockdownd_get_device_name(lockdown,&name);
        NSString *model=name ? @(name) : @"iPhone"; free(name);
        plist_t version=NULL; lockdownd_get_value(lockdown,NULL,"ProductVersion",&version);
        NSMutableDictionary *labels=[NSMutableDictionary dictionary];
        for(NSDictionary *app in Apps()) labels[[@"/" stringByAppendingString:app[@"id"]]]=app[@"name"];
        return @{@"sharedAppNames":labels,@"transport":@"ios",@"mtpDeviceInfo":@{@"Model":model,@"SerialNumber":serial,@"DeviceVersion":Object(version) ?: @""},@"usbDeviceInfo":@{@"SerialNumber":serial,@"Product":model}};
    }
    if([op isEqual:@"listStorages"]) return @{@"65538":@{@"name":@"App 共享文档",@"selected":@YES,@"info":@{@"StorageType":@3,@"StorageDescription":@"App 共享文档"}}};
    if([r[@"storageId"] integerValue]!=65538) Fail(@"iOS 文件共享目录已变化，请重新连接");
    if([op isEqual:@"listFiles"]) {
        NSString *virtual=ValidPath(r[@"filePath"],YES);
        NSMutableArray *nodes=[NSMutableArray array];
        if([virtual isEqual:@"/"]) {
            for(NSDictionary *app in Apps()) [nodes addObject:@{@"name":app[@"name"],@"path":[@"/" stringByAppendingString:app[@"id"]],@"size":@0,@"isFolder":@YES,@"isAppRoot":@YES,@"dateAdded":@"1970-01-01T00:00:00Z"}];
        } else {
            NSString *p=Remote(virtual,YES); SafeRemote(p,NO);
            for(NSString *name in Children(p)) {
                if([r[@"ignoreHidden"] boolValue] && [name hasPrefix:@"."]) continue;
                NSDictionary *s=Stat([p stringByAppendingPathComponent:name],NO);
                NSTimeInterval seconds=[s[@"st_mtime"] doubleValue]/1e9;
                [nodes addObject:@{@"name":name,@"path":[virtual stringByAppendingPathComponent:name],@"size":@([s[@"st_size"] longLongValue]),@"isFolder":@([s[@"st_ifmt"] isEqual:@"S_IFDIR"]),@"dateAdded":[NSISO8601DateFormatter.new stringFromDate:[NSDate dateWithTimeIntervalSince1970:seconds]]}];
            }
        }
        return nodes;
    }
    if([op isEqual:@"filesExist"]) {
        for(NSString *virtual in r[@"fileList"]) { NSString *p=Remote(virtual,NO); SafeRemote([p stringByDeletingLastPathComponent],NO); if(Stat(p,YES)) return @YES; }
        return @NO;
    }
    if([op isEqual:@"makeDirectory"] || [op isEqual:@"renameFile"]) {
        NSString *p=Remote(r[@"filePath"],NO); SafeRemote([p stringByDeletingLastPathComponent],NO);
        if([op isEqual:@"makeDirectory"]) { if(Stat(p,YES)) Fail(@"同名文件已存在"); Check(afc_make_directory(afc,p.UTF8String),@"创建目录"); }
        else {
            SafeRemote(p,NO); NSString *name=r[@"newFilename"];
            if(![name isKindOfClass:NSString.class] || !name.length || [name containsString:@"/"] || [@[@".",@".."] containsObject:name]) Fail(@"文件名无效");
            NSString *target=[p.stringByDeletingLastPathComponent stringByAppendingPathComponent:name]; ValidPath(target,NO);
            if(Stat(target,YES)) Fail(@"同名文件已存在"); Check(afc_rename_path(afc,p.UTF8String,target.UTF8String),@"重命名");
        }
        return @YES;
    }
    NSArray *files=r[@"fileList"];
    if(![files isKindOfClass:NSArray.class] || !files.count) Fail(@"未选择文件");
    if([op isEqual:@"deleteFiles"]) { for(NSString *v in files) { NSString *p=Remote(v,NO); SafeRemote(p,NO); RemoveTree(p); } return @YES; }
    if(![op isEqual:@"transferFiles"]) Fail(@"不支持的 iOS 操作");
    direction=r[@"direction"];
    if(![@[@"upload",@"download"] containsObject:direction]) Fail(@"传输方向无效");
    BOOL upload=[direction isEqual:@"upload"];
    NSString *destination=upload ? Remote(r[@"destination"],YES) : [ValidPath(r[@"destination"],YES) stringByResolvingSymlinksInPath];
    if(upload) { SafeRemote(destination,NO); if(![Stat(destination,NO)[@"st_ifmt"] isEqual:@"S_IFDIR"]) Fail(@"目标不是目录"); }
    else SafeLocalParent(destination);
    // Preflight every source and conflict before writing any file.
    NSMutableArray *sources=[NSMutableArray array]; NSMutableSet *names=[NSMutableSet set];
    for(NSString *v in files) {
        NSString *p=upload ? ValidPath(v,NO) : Remote(v,NO);
        if(!upload) SafeRemote(p,NO);
        NSString *name=p.lastPathComponent;
        if([names containsObject:name]) Fail(@"所选文件包含重名项"); [names addObject:name];
        NSString *target=[destination stringByAppendingPathComponent:name];
        if(upload) { if(Stat(target,YES)) Fail(@"目标已存在，请重命名后重试；iOS 传输不会覆盖已有文件"); }
        else { struct stat s; if(!lstat(target.fileSystemRepresentation,&s)) Fail(@"目标已存在，请重命名后重试"); }
        totalBytes+=Measure(p,upload); [sources addObject:p];
    }
    started=NSDate.timeIntervalSinceReferenceDate;
    for(NSUInteger i=0;i<sources.count;i++) {
        // Re-select the correct app for multi-app downloads.
        NSString *source=upload ? sources[i] : Remote(files[i],NO);
        NSString *target=[destination stringByAppendingPathComponent:source.lastPathComponent];
        NSString *staging=[destination stringByAppendingPathComponent:[@".openmtp-" stringByAppendingString:NSUUID.UUID.UUIDString]];
        @try {
            CopyTree(source,staging,upload);
            if(upload) { if(Stat(target,YES)) Fail(@"目标已存在"); Check(afc_rename_path(afc,staging.UTF8String,target.UTF8String),@"保存设备文件"); }
            else if(renamex_np(staging.fileSystemRepresentation,target.fileSystemRepresentation,RENAME_EXCL)) Fail(@"无法保存文件，目标可能已存在");
        } @finally {
            if(upload) { @try { if(Stat(staging,YES)) RemoveTree(staging); } @catch(NSException *ignored) {} }
            else [fm removeItemAtPath:staging error:nil];
        }
    }
    return @YES;
}
int main(void) {
    @autoreleasepool {
        fm=NSFileManager.defaultManager;
        @try {
            NSData *input=[[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
            NSDictionary *request=[NSJSONSerialization JSONObjectWithData:input options:0 error:nil];
            if(![request isKindOfClass:NSDictionary.class]) Fail(@"请求格式无效");
            Emit(@{@"data":Run(request) ?: NSNull.null,@"error":NSNull.null,@"stderr":NSNull.null});
        } @catch(NSException *e) { Emit(@{@"data":NSNull.null,@"error":e.reason ?: @"iOS 操作失败",@"stderr":[@"iOS: " stringByAppendingString:e.reason ?: @"操作失败"]}); }
        if(afc) afc_client_free(afc); if(house) house_arrest_client_free(house);
        if(lockdown) lockdownd_client_free(lockdown); if(device) idevice_free(device);
    }
    return 0;
}
