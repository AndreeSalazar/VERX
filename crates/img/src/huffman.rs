//! Códigos de Huffman canónicos para el compresor: longitudes óptimas a partir de
//! las frecuencias (método de las dos colas), acotadas a una longitud máxima
//! (15 bits en DEFLATE, 7 para el alfabeto de longitudes) y los códigos ya
//! invertidos, porque DEFLATE los escribe empezando por el bit alto.

/// Longitud de código de cada símbolo (0 si no aparece), como mucho `limit`.
#[must_use]
pub fn lengths(freq: &[u32], limit: u8) -> Vec<u8> {
    let mut lens = vec![0u8; freq.len()];
    let mut leaves: Vec<(u64, usize)> = freq
        .iter()
        .enumerate()
        .filter(|&(_, &f)| f > 0)
        .map(|(i, &f)| (u64::from(f), i))
        .collect();
    match leaves.len() {
        0 => return lens,
        1 => {
            lens[leaves[0].1] = 1;
            return lens;
        }
        _ => {}
    }
    leaves.sort_unstable();
    let k = leaves.len();
    // Árbol: hojas 0..k ordenadas, nodos internos detrás; las dos colas ya están
    // ordenadas, así que siempre se toman los dos pesos menores en O(1).
    let mut weight: Vec<u64> = leaves.iter().map(|&(w, _)| w).collect();
    let mut parent = vec![usize::MAX; 2 * k - 1];
    let (mut leaf, mut inner) = (0, k);
    for _ in 0..k - 1 {
        let mut take = || {
            let use_leaf = leaf < k && (inner >= weight.len() || weight[leaf] <= weight[inner]);
            if use_leaf {
                leaf += 1;
                leaf - 1
            } else {
                inner += 1;
                inner - 1
            }
        };
        let (a, b) = (take(), take());
        let node = weight.len();
        weight.push(weight[a] + weight[b]);
        parent[a] = node;
        parent[b] = node;
    }
    for (j, &(_, symbol)) in leaves.iter().enumerate() {
        let (mut depth, mut x) = (0u8, j);
        while parent[x] != usize::MAX {
            depth += 1;
            x = parent[x];
        }
        lens[symbol] = depth;
    }
    limit_lengths(&mut lens, freq, limit);
    lens
}

// Si alguna longitud supera `limit`: se recorta y se reparte el exceso alargando
// los códigos más largos que aún caben (los menos frecuentes), hasta que la
// desigualdad de Kraft vuelve a cumplirse.
fn limit_lengths(lens: &mut [u8], freq: &[u32], limit: u8) {
    if lens.iter().all(|&l| l <= limit) {
        return;
    }
    for l in lens.iter_mut().filter(|l| **l > limit) {
        *l = limit;
    }
    let cap = 1u64 << limit;
    let mut kraft: u64 = lens
        .iter()
        .filter(|&&l| l > 0)
        .map(|&l| 1u64 << (limit - l))
        .sum();
    while kraft > cap {
        let Some(s) = (0..lens.len())
            .filter(|&s| lens[s] > 0 && lens[s] < limit)
            .max_by_key(|&s| (lens[s], u32::MAX - freq[s]))
        else {
            return;
        };
        kraft -= 1u64 << (limit - lens[s] - 1);
        lens[s] += 1;
    }
}

/// Códigos canónicos (RFC 1951 §3.2.2) para unas longitudes, con los bits ya
/// invertidos para un escritor que empieza por el bit bajo.
#[must_use]
pub fn codes(lens: &[u8]) -> Vec<u16> {
    let mut count = [0u16; 16];
    for &l in lens {
        count[usize::from(l)] += 1;
    }
    count[0] = 0;
    let mut next = [0u16; 16];
    let mut code = 0u16;
    for bits in 1..16 {
        code = (code + count[bits - 1]) << 1;
        next[bits] = code;
    }
    lens.iter()
        .map(|&l| {
            if l == 0 {
                return 0;
            }
            let c = next[usize::from(l)];
            next[usize::from(l)] += 1;
            c.reverse_bits() >> (16 - l)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{codes, lengths};

    fn kraft(lens: &[u8]) -> f64 {
        lens.iter()
            .filter(|&&l| l > 0)
            .map(|&l| 0.5f64.powi(i32::from(l)))
            .sum()
    }

    #[test]
    fn longitudes_optimas() {
        // Ejemplo clásico: frecuencias 5, 9, 12, 13, 16, 45.
        let lens = lengths(&[5, 9, 12, 13, 16, 45], 15);
        assert_eq!(lens, [4, 4, 3, 3, 3, 1]);
        assert_eq!(lengths(&[0, 7, 0], 15), [0, 1, 0]);
        assert_eq!(lengths(&[0, 0], 15), [0, 0]);
    }

    #[test]
    fn respeta_el_limite_y_kraft() {
        // Fibonacci: sin límite saldrían códigos de 20+ bits.
        let mut fib = std::vec![1u32, 1];
        while fib.len() < 25 {
            fib.push(fib[fib.len() - 1] + fib[fib.len() - 2]);
        }
        let lens = lengths(&fib, 7);
        assert!(lens.iter().all(|&l| (1..=7).contains(&l)));
        assert!(kraft(&lens) <= 1.0);
    }

    #[test]
    fn codigos_canonicos_invertidos() {
        // RFC 1951: longitudes (3,3,3,3,3,2,4,4) → F=00, A=010, …, G=1110, H=1111.
        let c = codes(&[3, 3, 3, 3, 3, 2, 4, 4]);
        assert_eq!(c[5], 0b00);
        assert_eq!(c[0], 0b010); // 010 invertido es 010
        assert_eq!(c[1], 0b110); // 011 → 110
        assert_eq!(c[7], 0b1111);
    }
}
