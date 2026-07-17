#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#define PARENT_FD 3
#define SOURCE_FD 4

/* These values are part of omd-darwin-publish-v1.abi.json. */
enum exit_code {
  EXIT_USAGE = 64,
  EXIT_SOURCE_INVALID = 65,
  EXIT_DESTINATION_EXISTS = 66,
  EXIT_EXCLUSIVE_RENAME_UNSUPPORTED = 67,
  EXIT_RENAME_FAILED = 68,
  EXIT_POSTCHECK_FAILED = 69
};

static int is_basename(const char *name) {
  return name != NULL && name[0] != '\0' && strcmp(name, ".") != 0 &&
      strcmp(name, "..") != 0 && strchr(name, '/') == NULL;
}

static int same_inode(const struct stat *a, const struct stat *b) {
  return a->st_dev == b->st_dev && a->st_ino == b->st_ino;
}

static int same_bytes(int left, int right) {
  unsigned char left_buffer[32768];
  unsigned char right_buffer[32768];
  ssize_t left_count;
  ssize_t right_count;

  if (lseek(left, 0, SEEK_SET) < 0 || lseek(right, 0, SEEK_SET) < 0) return 0;
  for (;;) {
    left_count = read(left, left_buffer, sizeof(left_buffer));
    if (left_count < 0) return 0;
    right_count = read(right, right_buffer, sizeof(right_buffer));
    if (right_count != left_count || right_count < 0) return 0;
    if (left_count == 0) return 1;
    if (memcmp(left_buffer, right_buffer, (size_t)left_count) != 0) return 0;
  }
}

static void fail(const char *code, enum exit_code status) {
  fprintf(stderr, "%s\n", code);
  exit(status);
}

int main(int argc, char **argv) {
  const char *command;
  const char *source_name;
  const char *destination_name;
  struct stat source_fd_stat;
  struct stat source_path_stat;
  struct stat destination_stat;
  int destination_fd;
  int directory_command;

  if (argc != 4) fail("USAGE", EXIT_USAGE);
  command = argv[1];
  source_name = argv[2];
  destination_name = argv[3];
  if (!is_basename(source_name) || !is_basename(destination_name)) fail("USAGE", EXIT_USAGE);
  directory_command = strcmp(command, "publish-directory-exclusive") == 0;
  if (!directory_command && strcmp(command, "publish-file-exclusive") != 0) fail("USAGE", EXIT_USAGE);

  if (fstat(SOURCE_FD, &source_fd_stat) != 0 ||
      fstatat(PARENT_FD, source_name, &source_path_stat, AT_SYMLINK_NOFOLLOW) != 0 ||
      !same_inode(&source_fd_stat, &source_path_stat)) fail("SOURCE_INVALID", EXIT_SOURCE_INVALID);
  if (directory_command) {
    if (!S_ISDIR(source_fd_stat.st_mode)) fail("SOURCE_INVALID", EXIT_SOURCE_INVALID);
  } else if (!S_ISREG(source_fd_stat.st_mode) || source_fd_stat.st_nlink != 1) {
    fail("SOURCE_INVALID", EXIT_SOURCE_INVALID);
  }

  if (fstatat(PARENT_FD, destination_name, &destination_stat, AT_SYMLINK_NOFOLLOW) == 0) {
    fail("DESTINATION_EXISTS", EXIT_DESTINATION_EXISTS);
  }
  if (errno != ENOENT) fail("RENAME_FAILED", EXIT_RENAME_FAILED);

  if (renameatx_np(PARENT_FD, source_name, PARENT_FD, destination_name, RENAME_EXCL) != 0) {
    if (errno == EEXIST) fail("DESTINATION_EXISTS", EXIT_DESTINATION_EXISTS);
    if (errno == ENOTSUP || errno == EINVAL) fail("EXCLUSIVE_RENAME_UNSUPPORTED", EXIT_EXCLUSIVE_RENAME_UNSUPPORTED);
    fail("RENAME_FAILED", EXIT_RENAME_FAILED);
  }

  if (fstatat(PARENT_FD, source_name, &source_path_stat, AT_SYMLINK_NOFOLLOW) == 0 || errno != ENOENT ||
      fstatat(PARENT_FD, destination_name, &destination_stat, AT_SYMLINK_NOFOLLOW) != 0 ||
      !same_inode(&source_fd_stat, &destination_stat)) fail("POSTCHECK_FAILED", EXIT_POSTCHECK_FAILED);
  if (directory_command) {
    if (!S_ISDIR(destination_stat.st_mode)) fail("POSTCHECK_FAILED", EXIT_POSTCHECK_FAILED);
    return 0;
  }
  if (!S_ISREG(destination_stat.st_mode) || destination_stat.st_nlink != 1 ||
      (destination_stat.st_mode & 07777) != (source_fd_stat.st_mode & 07777)) fail("POSTCHECK_FAILED", EXIT_POSTCHECK_FAILED);
  destination_fd = openat(PARENT_FD, destination_name, O_RDONLY | O_NOFOLLOW);
  if (destination_fd < 0 || !same_bytes(SOURCE_FD, destination_fd)) {
    if (destination_fd >= 0) close(destination_fd);
    fail("POSTCHECK_FAILED", EXIT_POSTCHECK_FAILED);
  }
  close(destination_fd);
  return 0;
}
