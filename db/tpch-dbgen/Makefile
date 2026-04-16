CC ?= gcc
CFLAGS ?= -O2 -g -DDBNAME=\"dss\" -DLINUX -DORACLE -DTPCH -DRNG_TEST -D_FILE_OFFSET_BITS=64
LDFLAGS ?=
LDLIBS ?= -lm

SRCS = build.c driver.c bm_utils.c rnd.c print.c load_stub.c bcd2.c speed_seed.c text.c permute.c rng64.c
OBJS = $(SRCS:.c=.o)

.PHONY: all clean

all: dbgen

dbgen: $(OBJS)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $^ $(LDLIBS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f dbgen $(OBJS)