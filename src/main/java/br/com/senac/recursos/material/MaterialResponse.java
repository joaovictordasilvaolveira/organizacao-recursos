package br.com.senac.recursos.material;

import java.util.UUID;

/** {@code restrito} e {@code emManutencao} são só leitura (ver {@code SalaResponse}). */
public record MaterialResponse(UUID id, String codigo, String nome, String tipo, int quantidade,
        boolean restrito, boolean emManutencao) {

    public MaterialResponse(UUID id, String codigo, String nome, String tipo, int quantidade) {
        this(id, codigo, nome, tipo, quantidade, false, false);
    }

    static MaterialResponse from(Material material) {
        return new MaterialResponse(
                material.getId(),
                material.getCodigo(),
                material.getNome(),
                material.getTipo(),
                material.getQuantidade(),
                material.isRestrito(),
                material.isEmManutencao());
    }
}
