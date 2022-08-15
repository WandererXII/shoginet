import contextlib
import ctypes
import typing
import os
import sys
import platform
import typing
import threading
import subprocess
from logger import log
import struct
import string


@contextlib.contextmanager
def make_cpuid() -> typing.Any:
    # Loosely based on cpuid.py by Anders Høst, licensed MIT:
    # https://github.com/flababah/cpuid.py

    # Prepare system information
    is_64bit = ctypes.sizeof(ctypes.c_void_p) == 8
    if platform.machine().lower() not in ["amd64", "x86_64", "x86", "i686"]:
        raise OSError("Got no CPUID opcodes for %s" % platform.machine())

    # Struct for return value
    class CPUID_struct(ctypes.Structure):
        _fields_ = [("eax", ctypes.c_uint32),
                    ("ebx", ctypes.c_uint32),
                    ("ecx", ctypes.c_uint32),
                    ("edx", ctypes.c_uint32)]

    # Select kernel32 or libc
    if sys.platform == "win32":
        libc = ctypes.windll.kernel32
    else:
        libc = ctypes.cdll.LoadLibrary("")

    # Select opcodes
    if is_64bit:
        if sys.platform == "win32":
            # Windows x86_64
            # Three first call registers : RCX, RDX, R8
            # Volatile registers         : RAX, RCX, RDX, R8-11
            opc = [
                0x53,                    # push   %rbx
                0x89, 0xd0,              # mov    %edx,%eax
                0x49, 0x89, 0xc9,        # mov    %rcx,%r9
                0x44, 0x89, 0xc1,        # mov    %r8d,%ecx
                0x0f, 0xa2,              # cpuid
                0x41, 0x89, 0x01,        # mov    %eax,(%r9)
                0x41, 0x89, 0x59, 0x04,  # mov    %ebx,0x4(%r9)
                0x41, 0x89, 0x49, 0x08,  # mov    %ecx,0x8(%r9)
                0x41, 0x89, 0x51, 0x0c,  # mov    %edx,0xc(%r9)
                0x5b,                    # pop    %rbx
                0xc3                     # retq
            ]
        else:
            # Posix x86_64
            # Three first call registers : RDI, RSI, RDX
            # Volatile registers         : RAX, RCX, RDX, RSI, RDI, R8-11
            opc = [
                0x53,                    # push   %rbx
                0x89, 0xf0,              # mov    %esi,%eax
                0x89, 0xd1,              # mov    %edx,%ecx
                0x0f, 0xa2,              # cpuid
                0x89, 0x07,              # mov    %eax,(%rdi)
                0x89, 0x5f, 0x04,        # mov    %ebx,0x4(%rdi)
                0x89, 0x4f, 0x08,        # mov    %ecx,0x8(%rdi)
                0x89, 0x57, 0x0c,        # mov    %edx,0xc(%rdi)
                0x5b,                    # pop    %rbx
                0xc3                     # retq
            ]
    else:
        # CDECL 32 bit
        # Three first call registers : Stack (%esp)
        # Volatile registers         : EAX, ECX, EDX
        opc = [
            0x53,                    # push   %ebx
            0x57,                    # push   %edi
            0x8b, 0x7c, 0x24, 0x0c,  # mov    0xc(%esp),%edi
            0x8b, 0x44, 0x24, 0x10,  # mov    0x10(%esp),%eax
            0x8b, 0x4c, 0x24, 0x14,  # mov    0x14(%esp),%ecx
            0x0f, 0xa2,              # cpuid
            0x89, 0x07,              # mov    %eax,(%edi)
            0x89, 0x5f, 0x04,        # mov    %ebx,0x4(%edi)
            0x89, 0x4f, 0x08,        # mov    %ecx,0x8(%edi)
            0x89, 0x57, 0x0c,        # mov    %edx,0xc(%edi)
            0x5f,                    # pop    %edi
            0x5b,                    # pop    %ebx
            0xc3                     # ret
        ]

    code_size = len(opc)
    code = (ctypes.c_ubyte * code_size)(*opc)

    if sys.platform == "win32":
        # Allocate executable memory
        libc.VirtualAlloc.restype = ctypes.c_void_p
        libc.VirtualAlloc.argtypes = [
            ctypes.c_void_p, ctypes.c_size_t, ctypes.c_ulong, ctypes.c_ulong]
        addr = libc.VirtualAlloc(None, code_size, 0x1000, 0x40)
        if not addr:
            raise MemoryError("Could not VirtualAlloc RWX memory")
    else:
        # Allocate memory
        libc.valloc.restype = ctypes.c_void_p
        libc.valloc.argtypes = [ctypes.c_size_t]
        addr = libc.valloc(code_size)
        if not addr:
            raise MemoryError("Could not valloc memory")

        # Make executable
        libc.mprotect.restype = ctypes.c_int
        libc.mprotect.argtypes = [
            ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int]
        if 0 != libc.mprotect(addr, code_size, 1 | 2 | 4):
            raise OSError("Failed to set RWX using mprotect")

    # Copy code to allocated executable memory. No need to flush instruction
    # cache for CPUID.
    ctypes.memmove(addr, code, code_size)

    # Create and yield callable
    result = CPUID_struct()
    func_type = ctypes.CFUNCTYPE(None, ctypes.POINTER(
        CPUID_struct), ctypes.c_uint32, ctypes.c_uint32)
    func_ptr = func_type(addr)

    def cpuid(eax: int, ecx: int = 0) -> typing.Any:
        func_ptr(result, eax, ecx)
        return result.eax, result.ebx, result.ecx, result.edx

    yield cpuid

    # Free
    if sys.platform == "win32":
        libc.VirtualFree.restype = ctypes.c_long
        libc.VirtualFree.argtypes = [
            ctypes.c_void_p, ctypes.c_size_t, ctypes.c_ulong]
        libc.VirtualFree(addr, 0, 0x8000)
    else:
        libc.free.restype = None
        libc.free.argtypes = [ctypes.c_void_p]
        libc.free(addr)


def open_process(command: typing.List[str], cwd: typing.Optional[str] = None, shell: bool = True, _popen_lock: threading.Lock = threading.Lock()) -> subprocess.Popen:
    kwargs: typing.Dict[str, typing.Any] = {
        "shell": shell,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "stdin": subprocess.PIPE,
        "bufsize": 1,  # Line buffered
        "universal_newlines": True,
    }

    if cwd is not None:
        kwargs["cwd"] = cwd

    # Prevent signal propagation from parent process
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["preexec_fn"] = os.setpgrp

    with _popen_lock:
        return subprocess.Popen(command, **kwargs)


def detect_cpu_capabilities() -> typing.Tuple[str, bool, bool, bool, bool]:
    # Detects support for popcnt and pext instructions
    vendor, modern, bmi2, sse42, avx2 = "", False, False, False, False

    # Run cpuid in subprocess for robustness in case of segfaults
    cmd = []
    cmd.append(sys.executable)
    cmd.append(__file__)

    process = typing.cast(typing.Any, open_process(cmd, shell=False))

    # Parse output
    while True:
        line = process.stdout.readline()
        if not line:
            break

        line = line.rstrip()
        log.debug("cpuid >> %s", line)
        if not line:
            continue

        columns = line.split()
        if columns[0] == "CPUID":
            pass
        elif len(columns) == 5 and all(all(c in string.hexdigits for c in col) for col in columns):
            eax, a, b, c, d = [int(col, 16) for col in columns]

            # vendor
            if eax == 0:
                vendor = struct.pack("III", b, d, c).decode("utf-8")

            # popcnt
            if eax == 1 and c & (1 << 23):
                modern = True

            # pext
            if eax == 7 and b & (1 << 8):
                bmi2 = True

            if eax == 1 and c & (1 << 20):
                sse42 = True

            if eax == 7 and b & (1 << 5):
                avx2 = True
        else:
            log.warning("Unexpected cpuid output: %s", line)

    # Done
    process.communicate()
    if process.returncode != 0:
        log.error("cpuid exited with status code %d", process.returncode)

    return vendor, modern, bmi2, sse42, avx2


def cpuid() -> None:
    with make_cpuid() as cpuid:
        headers = ["CPUID", "EAX", "EBX", "ECX", "EDX"]
        print(" ".join(header.ljust(8) for header in headers).rstrip())

        for eax in [0x0, 0x80000000]:
            highest, _, _, _ = cpuid(eax)
            for eax in range(eax, highest + 1):
                a, b, c, d = cpuid(eax)
                print("%08x %08x %08x %08x %08x" % (eax, a, b, c, d))


if __name__ == "__main__":
    cpuid()
