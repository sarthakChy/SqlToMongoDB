#include "config.h"
#include "dss.h"
#include <stdio.h>
#include <stdlib.h>
#include "rng64.h"
extern double dM;

extern seed_t Seed[];

void
dss_random64(DSS_HUGE *tgt, DSS_HUGE nLow, DSS_HUGE nHigh, long nStream)
{
    DSS_HUGE            nTemp;

    if (nStream < 0 || nStream > MAX_STREAM)
        nStream = 0;

    if (nLow > nHigh)
    {
        nTemp = nLow;
        nLow = nHigh;
        nHigh = nTemp;
    }

    Seed[nStream].value = NextRand64(Seed[nStream].value);
    nTemp = Seed[nStream].value;
    if (nTemp < 0) 
	nTemp = -nTemp;
    nTemp %= (nHigh - nLow + 1);
    *tgt = nLow + nTemp;
    Seed[nStream].usage += 1;
#ifdef RNG_TEST
   Seed[nStream].nCalls += 1;
#endif

	return;
}

DSS_HUGE
NextRand64(DSS_HUGE nSeed){
	
	DSS_HUGE a = (unsigned DSS_HUGE) RNG_A;
    DSS_HUGE c = (unsigned DSS_HUGE) RNG_C;
    nSeed = (nSeed * a + c); /* implicitely truncated to 64bits */
	
    return (nSeed);
}

DSS_HUGE AdvanceRand64( DSS_HUGE nSeed,
				  DSS_HUGE nCount) {
  unsigned DSS_HUGE a = RNG_A ;
  unsigned DSS_HUGE c = RNG_C ;
  int nBit;
  unsigned DSS_HUGE Apow=a, Dsum=c;

  /* if nothing to do, do nothing ! */
  if( nCount == 0 ) return nSeed;

  /* Recursively compute X(n) = A * X(n-1) + C */
  /* */
  /* explicitely: */
  /* X(n) = A^n * X(0) + { A^(n-1) + A^(n-2) + ... A + 1 } * C */
  /* */
  /* we write this as: */
  /* X(n) = Apow(n) * X(0) + Dsum(n) * C */
  /* */
  /* we use the following relations: */
  /* Apow(n) = A^(n%2)*Apow(n/2)*Apow(n/2) */
  /* Dsum(n) =   (n%2)*Apow(n/2)*Apow(n/2) + (Apow(n/2) + 1) * Dsum(n/2) */
  /* */

  /* first get the highest non-zero bit */
  for( nBit = 0; (nCount >> nBit) != RNG_C ; nBit ++){}
  
  /* go 1 bit at the time */
  while( --nBit >= 0 ) {
    Dsum *= (Apow + 1);
    Apow = Apow * Apow;
    if( ((nCount >> nBit) % 2) == 1 ) { /* odd value */
      Dsum += Apow;
      Apow *= a;
    }
  }
  nSeed = nSeed * Apow + Dsum * c;
  return nSeed;
}
